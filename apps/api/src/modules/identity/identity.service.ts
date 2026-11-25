import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { institutes, memberships, users, type Db, type InstituteStatus } from "@cbt/db";
import { DB, DB_SYSTEM, SystemAccess } from "../../common/db/db.module";
import { AUTH } from "../../common/auth/auth.module";
import type { Auth } from "../../common/auth/auth";
import { Notifier } from "../../common/adapters/notifier";
import { isUniqueViolation } from "../../common/pg-errors";
import { afterCommit, type RequestCtx } from "../../common/request-context";

export const registerInstituteInput = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/).optional(),
  contactEmail: z.string().email().optional(),
  adminName: z.string().trim().min(2).max(200),
  adminEmail: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export const updateInstituteInput = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  logo: z.string().url().nullable().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
});

const TRANSITIONS: Record<string, InstituteStatus[]> = {
  pending: ["approved", "deactivated"],
  approved: ["suspended", "deactivated"],
  suspended: ["approved", "deactivated"],
  deactivated: [],
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DB_SYSTEM) private readonly system: Db,
    private readonly sys: SystemAccess,
    @Inject(AUTH) private readonly auth: Auth,
    private readonly notifier: Notifier,
  ) {}

  /** FR-001: public registration. Creates the admin user + a PENDING institute; nothing is usable until approval. */
  async register(input: z.infer<typeof registerInstituteInput>) {
    const slug = input.slug ?? (slugify(input.name) || "institute");
    const [dupe] = await this.system.select({ id: institutes.id }).from(institutes).where(eq(institutes.slug, slug)).limit(1);
    if (dupe) throw new ConflictException("Institute slug already taken");
    const [existing] = await this.system.select({ id: users.id }).from(users).where(eq(users.email, input.adminEmail)).limit(1);
    if (existing) throw new ConflictException("An account with this email already exists");

    const created = await this.auth.api.signUpEmail({ body: { name: input.adminName, email: input.adminEmail, password: input.password } });
    const userId = (created as any).user.id as string;
    try {
      return await this.system.transaction(async (tx) => {
        const [inst] = await tx.insert(institutes).values({ name: input.name, slug, contactEmail: input.contactEmail ?? input.adminEmail }).returning();
        await tx.insert(memberships).values({ organizationId: inst!.id, userId, role: "institute_admin" });
        return { id: inst!.id, slug: inst!.slug, status: inst!.status };
      });
    } catch (e) {
      await this.system.delete(users).where(eq(users.id, userId)); // do not leave an orphan admin behind
      if (isUniqueViolation(e)) throw new ConflictException("Institute slug already taken");
      throw e;
    }
  }

  /** Super admin: every institute with its first admin's email and headline counts. */
  async list(status?: string) {
    const rows = await this.db.select().from(institutes).where(status ? eq(institutes.status, status as InstituteStatus) : undefined);
    const stats = await this.sys.run(async (db) => {
      const r: any = await db.execute(sql`
        select i.id,
          (select u.email from memberships m join users u on u.id::text = m.user_id::text where m.institute_id::text = i.id::text and m.role = 'institute_admin' order by m.created_at limit 1) as admin_email,
          (select count(*) from memberships m where m.institute_id::text = i.id::text and m.role = 'student' and m.status = 'active')::int as students,
          (select count(*) from memberships m where m.institute_id::text = i.id::text and m.role = 'teacher' and m.status = 'active')::int as teachers,
          (select count(*) from batches b where b.institute_id::text = i.id::text)::int as batches,
          (select count(*) from tests t where t.institute_id::text = i.id::text)::int as tests
        from institutes i`);
      return (r.rows ?? r) as Array<{ id: string; admin_email: string | null; students: number; teachers: number; batches: number; tests: number }>;
    });
    const by = new Map(stats.map((x) => [x.id, x]));
    return rows
      .map((r) => {
        const x = by.get(r.id);
        return { ...r, adminEmail: x?.admin_email ?? null, counts: { students: x?.students ?? 0, teachers: x?.teachers ?? 0, batches: x?.batches ?? 0, tests: x?.tests ?? 0 } };
      })
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  async get(id: string) {
    const [row] = await this.db.select().from(institutes).where(eq(institutes.id, id)).limit(1);
    if (!row) throw new NotFoundException();
    return row;
  }

  /** FR-002: approve / suspend / reactivate / deactivate. The row change is audited by trigger. */
  async setStatus(ctx: RequestCtx, id: string, to: InstituteStatus) {
    const inst = await this.get(id);
    if (!TRANSITIONS[inst.status]?.includes(to)) {
      throw new BadRequestException(`Cannot go from ${inst.status} to ${to}`);
    }
    const [row] = await this.db.update(institutes).set({
      status: to,
      updatedAt: new Date(),
      ...(to === "approved" ? { approvedAt: new Date(), approvedBy: ctx.userId } : {}),
    }).where(eq(institutes.id, id)).returning();

    // tell the institute admins (system connection: platform-level read of memberships)
    const admins = await this.sys.run((db) => db.select({ email: users.email, name: users.name }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, id), eq(memberships.role, "institute_admin"))));
    const template = to === "approved" ? "institute-approved" : to === "suspended" ? "institute-suspended" : `institute-${to}`;
    for (const a of admins) {
      await afterCommit(() => this.notifier.send({ to: a.email, template, data: { institute: inst.name, name: a.name }, dedupeKey: `${id}:${to}:${a.email}` }));
    }
    return row;
  }

  async updateOwn(ctx: RequestCtx, input: z.infer<typeof updateInstituteInput>) {
    if (!ctx.instituteId) throw new ForbiddenException();
    const [row] = await this.db.update(institutes).set({ ...input, updatedAt: new Date() })
      .where(eq(institutes.id, ctx.instituteId)).returning();
    return row;
  }

  /** Everything the web shell needs after login. */
  async me(ctx: RequestCtx) {
    const mine = await this.sys.run((db) => db
      .select({ instituteId: institutes.id, name: institutes.name, slug: institutes.slug, status: institutes.status, role: memberships.role })
      .from(memberships).innerJoin(institutes, eq(institutes.id, memberships.organizationId))
      .where(and(eq(memberships.userId, ctx.userId), eq(memberships.status, "active"))));
    return {
      user: { id: ctx.userId, name: ctx.name, email: ctx.email },
      role: ctx.role,
      instituteId: ctx.instituteId,
      institutes: mine,
      scope: { batchIds: ctx.batchIds, studentId: ctx.studentId ?? null, childStudentIds: ctx.childStudentIds },
      rules: ctx.ability.rules,
    };
  }
}
