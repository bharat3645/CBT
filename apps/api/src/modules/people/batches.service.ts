import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { batchTeachers, batches, enrolments, students, teachers, type Db } from "@cbt/db";
import { DB } from "../../common/db/db.module";
import { isUniqueViolation } from "../../common/pg-errors";
import type { RequestCtx } from "../../common/request-context";
import { batchInput } from "./people.schemas";

@Injectable()
export class BatchesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(ctx: RequestCtx) {
    const scoped = ctx.role === "teacher" || ctx.role === "student";
    if (scoped && ctx.batchIds.length === 0) return [];
    return this.db
      .select({
        ...getTableColumns(batches),
        studentCount: sql<number>`(select count(*) from enrolments e where e.batch_id = batches.id)::int`,
        teacherCount: sql<number>`(select count(*) from batch_teachers bt where bt.batch_id = batches.id)::int`,
      })
      .from(batches)
      .where(scoped ? inArray(batches.id, ctx.batchIds) : undefined)
      .orderBy(batches.name);
  }

  async get(ctx: RequestCtx, id: string) {
    if ((ctx.role === "teacher" || ctx.role === "student") && !ctx.batchIds.includes(id)) throw new NotFoundException();
    const [b] = await this.db.select().from(batches).where(eq(batches.id, id)).limit(1);
    if (!b) throw new NotFoundException();
    const [{ n: studentCount }] = (await this.db.select({ n: count() }).from(enrolments).where(eq(enrolments.batchId, id))) as any;
    const [{ n: teacherCount }] = (await this.db.select({ n: count() }).from(batchTeachers).where(eq(batchTeachers.batchId, id))) as any;
    return { ...b, studentCount: Number(studentCount), teacherCount: Number(teacherCount) };
  }

  async create(ctx: RequestCtx, raw: unknown) {
    const input = batchInput.parse(raw);
    try {
      const [b] = await this.db.insert(batches).values({ ...input, instituteId: ctx.instituteId! }).returning();
      return b;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("A batch with this name and year already exists");
      throw e;
    }
  }

  async update(id: string, raw: unknown) {
    const input = batchInput.partial().parse(raw);
    try {
      const [b] = await this.db.update(batches).set({ ...input, updatedAt: new Date() }).where(eq(batches.id, id)).returning();
      if (!b) throw new NotFoundException();
      return b;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("A batch with this name and year already exists");
      throw e;
    }
  }

  /** Batches are archived, not deleted, once anything is attached. */
  async remove(id: string) {
    const [{ n }] = (await this.db.select({ n: count() }).from(enrolments).where(eq(enrolments.batchId, id))) as any;
    if (Number(n) > 0) throw new ConflictException("Batch has enrolled students; archive it instead");
    const rows = await this.db.delete(batches).where(eq(batches.id, id)).returning({ id: batches.id });
    if (!rows.length) throw new NotFoundException();
    return { deleted: true };
  }

  async enrol(ctx: RequestCtx, batchId: string, studentIds: string[]) {
    if (!studentIds.length) throw new BadRequestException("studentIds required");
    await this.mustExist(batchId);
    const found = await this.db.select({ id: students.id }).from(students).where(inArray(students.id, studentIds));
    if (found.length !== new Set(studentIds).size) throw new BadRequestException("Unknown student id");
    const rows = await this.db.insert(enrolments)
      .values(studentIds.map((studentId) => ({ instituteId: ctx.instituteId!, batchId, studentId })))
      .onConflictDoNothing().returning({ id: enrolments.id });
    return { enrolled: rows.length, alreadyEnrolled: new Set(studentIds).size - rows.length };
  }

  async unenrol(batchId: string, studentId: string) {
    const rows = await this.db.delete(enrolments).where(and(eq(enrolments.batchId, batchId), eq(enrolments.studentId, studentId))).returning({ id: enrolments.id });
    if (!rows.length) throw new NotFoundException();
    return { removed: true };
  }

  async assignTeachers(ctx: RequestCtx, batchId: string, teacherIds: string[], subject?: string) {
    if (!teacherIds.length) throw new BadRequestException("teacherIds required");
    await this.mustExist(batchId);
    const found = await this.db.select({ id: teachers.id }).from(teachers).where(inArray(teachers.id, teacherIds));
    if (found.length !== new Set(teacherIds).size) throw new BadRequestException("Unknown teacher id");
    const rows = await this.db.insert(batchTeachers)
      .values(teacherIds.map((teacherId) => ({ instituteId: ctx.instituteId!, batchId, teacherId, subject: subject ?? null })))
      .onConflictDoNothing().returning({ id: batchTeachers.id });
    return { assigned: rows.length };
  }

  async unassignTeacher(batchId: string, teacherId: string) {
    const rows = await this.db.delete(batchTeachers).where(and(eq(batchTeachers.batchId, batchId), eq(batchTeachers.teacherId, teacherId))).returning({ id: batchTeachers.id });
    if (!rows.length) throw new NotFoundException();
    return { removed: true };
  }

  private async mustExist(id: string) {
    const [b] = await this.db.select({ id: batches.id }).from(batches).where(eq(batches.id, id)).limit(1);
    if (!b) throw new NotFoundException("Batch not found");
  }
}
