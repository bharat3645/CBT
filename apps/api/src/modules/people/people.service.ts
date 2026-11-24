import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  batchTeachers, batches, enrolments, guardianStudentLinks, guardians, memberships, students, teachers, users,
  type Db,
} from "@cbt/db";
import { DB, SystemAccess } from "../../common/db/db.module";
import { AUTH } from "../../common/auth/auth.module";
import type { Auth } from "../../common/auth/auth";
import { Notifier } from "../../common/adapters/notifier";
import { AuditService } from "../../common/audit/audit.service";
import { isUniqueViolation, pgConstraint } from "../../common/pg-errors";
import { afterCommit, type RequestCtx } from "../../common/request-context";
import type { CreatePersonInput } from "./people.schemas";
import { linkQuery, listPeopleQuery, updatePersonInput } from "./people.schemas";
import type { z } from "zod";

export class DuplicateError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
  }
}

/** Translate DB unique violations into field-level messages (shared by API calls and CSV rows). */
export function toDuplicateError(e: unknown): DuplicateError | undefined {
  if (!isUniqueViolation(e)) return undefined;
  const c = pgConstraint(e) ?? "";
  if (c.includes("memberships_inst_user")) return new DuplicateError("email", "This person is already a member of the institute");
  if (c.includes("students_inst_roll")) return new DuplicateError("roll_no", "Roll number already in use");
  if (c.includes("users_phone")) return new DuplicateError("phone", "Phone number belongs to another account");
  if (c.includes("users_email")) return new DuplicateError("email", "Email already registered");
  return new DuplicateError("row", "Duplicate record");
}

@Injectable()
export class PeopleService {
  constructor(
    @Inject(DB) readonly db: Db,
    private readonly sys: SystemAccess,
    @Inject(AUTH) private readonly auth: Auth,
    private readonly notifier: Notifier,
    private readonly audit: AuditService,
  ) {}

  /** Global identity: one user can belong to several institutes. Creates the user only if the email is new. */
  async ensureUser(p: { name: string; email: string; phone?: string }): Promise<string> {
    try {
      return await this.sys.run(async (db) => {
        const [found] = await db.select({ id: users.id }).from(users).where(eq(users.email, p.email)).limit(1);
        if (found) return found.id;
        const [u] = await db.insert(users).values({ name: p.name, email: p.email, phone: p.phone ?? null }).returning({ id: users.id });
        return u!.id;
      });
    } catch (e) {
      const d = toDuplicateError(e);
      if (d) throw d;
      throw e;
    }
  }

  /** Membership + role profile + batch links. Call inside a savepoint so a failure leaves nothing behind. */
  async insertPerson(tx: Db, instituteId: string, userId: string, p: Pick<CreatePersonInput, "role" | "rollNo" | "dob" | "employeeCode" | "qualification" | "relation" | "childStudentIds">, batchIds: string[]) {
    const [m] = await tx.insert(memberships).values({ organizationId: instituteId, userId, role: p.role }).returning({ id: memberships.id });
    const membershipId = m!.id;
    let profileId: string | null = null;

    if (p.role === "student") {
      const [s] = await tx.insert(students).values({ instituteId, membershipId, userId, rollNo: p.rollNo ?? null, dob: p.dob ?? null }).returning({ id: students.id });
      profileId = s!.id;
      if (batchIds.length) await tx.insert(enrolments).values(batchIds.map((batchId) => ({ instituteId, batchId, studentId: profileId! })));
    } else if (p.role === "teacher") {
      const [t] = await tx.insert(teachers).values({ instituteId, membershipId, userId, employeeCode: p.employeeCode ?? null, qualification: p.qualification ?? null }).returning({ id: teachers.id });
      profileId = t!.id;
      if (batchIds.length) await tx.insert(batchTeachers).values(batchIds.map((batchId) => ({ instituteId, batchId, teacherId: profileId! })));
    } else if (p.role === "parent") {
      const [g] = await tx.insert(guardians).values({ instituteId, membershipId, userId, relation: p.relation ?? null }).returning({ id: guardians.id });
      profileId = g!.id;
      if (p.childStudentIds.length) {
        await tx.insert(guardianStudentLinks).values(p.childStudentIds.map((studentId) => ({
          instituteId, guardianId: profileId!, studentId, status: "verified" as const, verifiedAt: new Date(),
        })));
      }
    }
    return { membershipId, profileId };
  }

  /** Emails a set-password link (reuses the password-reset flow) once the request has committed. Best effort. */
  invite(email: string, name: string) {
    return afterCommit(async () => {
      try {
        await this.auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
      } catch {
        /* delivery problems must not fail user creation */
      }
      await this.notifier.send({ to: email, template: "welcome", data: { name }, dedupeKey: `welcome:${email}` });
    });
  }

  async create(ctx: RequestCtx, input: CreatePersonInput) {
    const instituteId = ctx.instituteId!;
    await this.assertBatches(input.batchIds);
    await this.assertStudents(input.childStudentIds);
    const userId = await this.ensureUser(input).catch((e) => {
      if (e instanceof DuplicateError) throw new ConflictException({ message: e.message, field: e.field });
      throw e;
    });
    try {
      const res = await this.db.transaction((tx) => this.insertPerson(tx as unknown as Db, instituteId, userId, input, input.batchIds));
      await this.invite(input.email, input.name);
      return { id: userId, role: input.role, ...res };
    } catch (e) {
      const d = toDuplicateError(e);
      if (d) throw new ConflictException({ message: d.message, field: d.field });
      throw e;
    }
  }

  async assertBatches(ids: string[]) {
    if (!ids.length) return;
    const found = await this.db.select({ id: batches.id }).from(batches).where(inArray(batches.id, ids));
    if (found.length !== new Set(ids).size) throw new BadRequestException("Unknown batch id");
  }
  async assertStudents(ids: string[]) {
    if (!ids.length) return;
    const found = await this.db.select({ id: students.id }).from(students).where(inArray(students.id, ids));
    if (found.length !== new Set(ids).size) throw new BadRequestException("Unknown student id");
  }

  private baseSelect() {
    return this.db
      .select({
        id: users.id, name: users.name, email: users.email, phone: users.phone,
        role: memberships.role, status: memberships.status, membershipId: memberships.id,
        rollNo: students.rollNo, studentId: students.id, teacherId: teachers.id, guardianId: guardians.id,
        employeeCode: teachers.employeeCode,
        /** students: enrolled batches; teachers: assigned batches */
        batchNames: sql<string[]>`coalesce(
          (select json_agg(b.name order by b.name) from enrolments e join batches b on b.id = e.batch_id where e.student_id = ${students.id}),
          (select json_agg(b.name order by b.name) from batch_teachers bt join batches b on b.id = bt.batch_id where bt.teacher_id = ${teachers.id}),
          '[]'::json)`,
        /** parents: verified linked children */
        childNames: sql<string[]>`coalesce(
          (select json_agg(u2.name order by u2.name) from guardian_student_links l join students s2 on s2.id = l.student_id join users u2 on u2.id = s2.user_id
             where l.guardian_id = ${guardians.id} and l.status = 'verified'),
          '[]'::json)`,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(students, eq(students.membershipId, memberships.id))
      .leftJoin(teachers, eq(teachers.membershipId, memberships.id))
      .leftJoin(guardians, eq(guardians.membershipId, memberships.id));
  }

  async list(ctx: RequestCtx, raw: unknown) {
    const f = listPeopleQuery.parse(raw);
    const conds = [
      f.role ? eq(memberships.role, f.role) : undefined,
      f.q ? or(ilike(users.name, `%${f.q}%`), ilike(users.email, `%${f.q}%`)) : undefined,
      f.batchId
        ? sql`(exists (select 1 from ${enrolments} e where e.student_id = ${students.id} and e.batch_id = ${f.batchId})
              or exists (select 1 from ${batchTeachers} bt where bt.teacher_id = ${teachers.id} and bt.batch_id = ${f.batchId}))`
        : undefined,
      // teachers only see students of their own batches
      ctx.role === "teacher"
        ? sql`(${memberships.role} = 'student' and exists (select 1 from ${enrolments} e where e.student_id = ${students.id} and e.batch_id in (${sql.join(
            (ctx.batchIds.length ? ctx.batchIds : ["00000000-0000-0000-0000-000000000000"]).map((b) => sql`${b}::uuid`), sql`, `)})))`
        : undefined,
    ].filter(Boolean) as any[];
    return this.baseSelect().where(conds.length ? and(...conds) : undefined).orderBy(users.name).limit(f.limit).offset(f.offset);
  }

  async get(ctx: RequestCtx, userId: string) {
    const rows = await this.baseSelect().where(eq(memberships.userId, userId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException();
    if (ctx.role === "teacher") {
      const own = (await this.list(ctx, { limit: 200 })).some((r) => r.id === userId);
      if (!own) throw new NotFoundException();
    }
    return row;
  }

  async update(ctx: RequestCtx, userId: string, raw: unknown) {
    const input = updatePersonInput.parse(raw);
    const person = await this.get(ctx, userId);
    try {
      if (input.status) await this.db.update(memberships).set({ status: input.status }).where(eq(memberships.id, person.membershipId));
      if (person.role === "student" && (input.rollNo !== undefined || input.dob !== undefined)) {
        await this.db.update(students).set({
          ...(input.rollNo !== undefined ? { rollNo: input.rollNo } : {}),
          ...(input.dob !== undefined ? { dob: input.dob } : {}),
          updatedAt: new Date(),
        }).where(eq(students.membershipId, person.membershipId));
      }
      if (person.role === "teacher" && (input.employeeCode !== undefined || input.qualification !== undefined)) {
        await this.db.update(teachers).set({
          ...(input.employeeCode !== undefined ? { employeeCode: input.employeeCode } : {}),
          ...(input.qualification !== undefined ? { qualification: input.qualification } : {}),
          updatedAt: new Date(),
        }).where(eq(teachers.membershipId, person.membershipId));
      }
      if (person.role === "parent" && input.relation !== undefined) {
        await this.db.update(guardians).set({ relation: input.relation, updatedAt: new Date() }).where(eq(guardians.membershipId, person.membershipId));
      }
    } catch (e) {
      const d = toDuplicateError(e);
      if (d) throw new ConflictException({ message: d.message, field: d.field });
      throw e;
    }
    return this.get(ctx, userId);
  }

  /** FR-007: user deletion is a soft deactivate of the membership, audited. The global account is untouched. */
  async remove(ctx: RequestCtx, userId: string) {
    const person = await this.get(ctx, userId);
    if (userId === ctx.userId) throw new BadRequestException("You cannot remove yourself");
    await this.db.update(memberships).set({ status: "inactive" }).where(eq(memberships.id, person.membershipId));
    await this.audit.record("user.deactivate", "users", userId, { role: person.role });
    return { id: userId, status: "inactive" };
  }

  // ---- guardian links (admin creates verified links; the parent-claim flow belongs to M10) ----
  async link(guardianId: string, studentId: string, ctx: RequestCtx) {
    await this.assertStudents([studentId]);
    const [g] = await this.db.select({ id: guardians.id }).from(guardians).where(eq(guardians.id, guardianId)).limit(1);
    if (!g) throw new NotFoundException("Guardian not found");
    const [existing] = await this.db.select().from(guardianStudentLinks)
      .where(and(eq(guardianStudentLinks.guardianId, guardianId), eq(guardianStudentLinks.studentId, studentId))).limit(1);
    if (existing?.status === "verified") throw new ConflictException("Already linked");
    const verified = { status: "verified" as const, verifiedBy: ctx.userId, verifiedAt: new Date() };
    // a revoked or pending link is re-verified instead of colliding with the unique (guardian, student) index
    if (existing) {
      const [row] = await this.db.update(guardianStudentLinks).set(verified).where(eq(guardianStudentLinks.id, existing.id)).returning();
      return row;
    }
    try {
      const [row] = await this.db.insert(guardianStudentLinks).values({ instituteId: ctx.instituteId!, guardianId, studentId, ...verified }).returning();
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("Already linked");
      throw e;
    }
  }

  /** Guardian links with names, for the admin parent screen. Revoked links are hidden. */
  async links(raw: unknown) {
    const f = linkQuery.parse(raw);
    return this.db
      .select({
        guardianId: guardianStudentLinks.guardianId, studentId: guardianStudentLinks.studentId, status: guardianStudentLinks.status,
        guardianName: sql<string>`(select u.name from guardians g join users u on u.id = g.user_id where g.id = guardian_student_links.guardian_id)`,
        studentName: sql<string>`(select u.name from students s join users u on u.id = s.user_id where s.id = guardian_student_links.student_id)`,
        rollNo: sql<string | null>`(select s.roll_no from students s where s.id = guardian_student_links.student_id)`,
      })
      .from(guardianStudentLinks)
      .where(and(
        sql`${guardianStudentLinks.status} <> 'revoked'`,
        f.guardianId ? eq(guardianStudentLinks.guardianId, f.guardianId) : undefined,
        f.studentId ? eq(guardianStudentLinks.studentId, f.studentId) : undefined,
      ))
      .limit(500);
  }
  async unlink(guardianId: string, studentId: string) {
    const rows = await this.db.update(guardianStudentLinks).set({ status: "revoked" })
      .where(and(eq(guardianStudentLinks.guardianId, guardianId), eq(guardianStudentLinks.studentId, studentId))).returning({ id: guardianStudentLinks.id });
    if (!rows.length) throw new NotFoundException();
    return { revoked: true };
  }
}

export type UpdatePersonInput = z.infer<typeof updatePersonInput>;
