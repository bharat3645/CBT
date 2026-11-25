import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@cbt/db";
import { DB } from "../../common/db/db.module";
import type { RequestCtx } from "../../common/request-context";
import { NotificationsService } from "../notifications/notifications.service";
import { linkedChildUserIds } from "../results/actor";

const rows = (res: any): any[] => (Array.isArray(res) ? res : res?.rows ?? []);
const STAFF = ["teacher", "institute_admin"];

export const attendanceInput = z.object({
  batchId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(z.object({ studentUserId: z.string().uuid(), status: z.enum(["present", "absent", "late", "excused"]) })).max(500),
});
export const feedbackInput = z.object({ studentUserId: z.string().uuid(), body: z.string().trim().min(3).max(2000) });
export const checkInput = z.object({ questionId: z.string().uuid(), answer: z.union([z.string(), z.array(z.string())]) });

@Injectable()
export class Phase2Service {
  constructor(@Inject(DB) private readonly db: Db, private readonly notifier: NotificationsService) {}
  private q(query: any): Promise<any[]> { return (this.db as any).execute(query).then(rows); }

  private requireStaff(ctx: RequestCtx) { if (!STAFF.includes(ctx.role)) throw new ForbiddenException("Staff only"); }
  private requireBatch(ctx: RequestCtx, batchId: string) {
    this.requireStaff(ctx);
    if (ctx.role === "teacher" && !ctx.batchIds.includes(batchId)) throw new ForbiddenException("Not your batch");
  }
  /** The student a caller may look at: self, a verified linked child, or any student for staff. */
  private async viewable(ctx: RequestCtx, studentUserId?: string): Promise<string> {
    if (ctx.role === "student") return ctx.userId;
    if (ctx.role === "parent") {
      const kids = await linkedChildUserIds(this.db, ctx.userId, ctx.instituteId!);
      const id = studentUserId ?? kids[0];
      if (!id || !kids.includes(id)) throw new ForbiddenException("Not your child");
      return id;
    }
    this.requireStaff(ctx);
    if (!studentUserId) throw new BadRequestException("studentUserId required");
    const [st] = await this.q(sql`select 1 from students where user_id = ${studentUserId} and institute_id = ${ctx.instituteId}`);
    if (!st) throw new NotFoundException("Student not found");
    return studentUserId;
  }

  async roster(ctx: RequestCtx, batchId: string, date: string) {
    this.requireBatch(ctx, batchId);
    return this.q(sql`
      select s.user_id::text as "studentUserId", u.name, s.roll_no as "rollNo", a.status
      from enrolments e join students s on s.id = e.student_id join users u on u.id = s.user_id
      left join attendance_records a on a.batch_id = e.batch_id and a.student_user_id = s.user_id and a.on_date = ${date}::date
      where e.batch_id = ${batchId} and e.institute_id = ${ctx.instituteId} order by u.name`);
  }

  async mark(ctx: RequestCtx, input: z.infer<typeof attendanceInput>) {
    this.requireBatch(ctx, input.batchId);
    const valid = new Set((await this.roster(ctx, input.batchId, input.date)).map((r) => r.studentUserId));
    let saved = 0;
    for (const r of input.records) {
      if (!valid.has(r.studentUserId)) continue;
      await this.q(sql`insert into attendance_records (institute_id, batch_id, student_user_id, on_date, status, marked_by)
        values (${ctx.instituteId}, ${input.batchId}, ${r.studentUserId}, ${input.date}::date, ${r.status}, ${ctx.userId})
        on conflict (batch_id, student_user_id, on_date) do update set status = excluded.status, marked_by = excluded.marked_by, updated_at = now()`);
      saved++;
      if (r.status === "absent") {
        const dedupe = `attendance_alert:${input.batchId}:${r.studentUserId}:${input.date}`;
        await this.notifier.notify({ instituteId: ctx.instituteId!, userId: r.studentUserId, type: "attendance_alert", dedupeKey: dedupe,
          title: "Marked absent", body: `You were marked absent on ${input.date}.`, channels: ["in_app"] });
        for (const p of await this.q(sql`select g.user_id::text as id from guardian_student_links l join guardians g on g.id = l.guardian_id
            join students s on s.id = l.student_id where s.user_id = ${r.studentUserId} and l.status = 'verified'`)) {
          await this.notifier.notify({ instituteId: ctx.instituteId!, userId: p.id, type: "attendance_alert", dedupeKey: `${dedupe}:${p.id}`,
            title: "Your child was absent", body: `Absent on ${input.date}.`, channels: ["in_app"] });
        }
      }
    }
    return { saved };
  }

  async summary(ctx: RequestCtx, studentUserId?: string) {
    const id = await this.viewable(ctx, studentUserId);
    const [t] = await this.q(sql`select count(*)::int total,
      count(*) filter (where status in ('present','late'))::int attended,
      count(*) filter (where status = 'present')::int present, count(*) filter (where status = 'late')::int late,
      count(*) filter (where status = 'absent')::int absent, count(*) filter (where status = 'excused')::int excused
      from attendance_records where student_user_id = ${id}`);
    const recent = await this.q(sql`select a.on_date::text as date, a.status, b.name as batch from attendance_records a
      join batches b on b.id = a.batch_id where a.student_user_id = ${id} order by a.on_date desc limit 30`);
    const countable = t.total - t.excused;
    return { ...t, percent: countable > 0 ? Math.round((t.attended / countable) * 1000) / 10 : null, recent };
  }

  async listFeedback(ctx: RequestCtx, studentUserId?: string) {
    const id = await this.viewable(ctx, studentUserId);
    return this.q(sql`select id::text, author_name as "authorName", body, created_at as "createdAt"
      from teacher_feedback where student_user_id = ${id} order by created_at desc limit 50`);
  }

  async addFeedback(ctx: RequestCtx, input: z.infer<typeof feedbackInput>) {
    this.requireStaff(ctx);
    const [st] = await this.q(sql`select 1 from students where user_id = ${input.studentUserId} and institute_id = ${ctx.instituteId}`);
    if (!st) throw new NotFoundException("Student not found");
    const [row] = await this.q(sql`insert into teacher_feedback (institute_id, student_user_id, author_id, author_name, body)
      values (${ctx.instituteId}, ${input.studentUserId}, ${ctx.userId}, ${ctx.name}, ${input.body}) returning id::text`);
    const guardians = await this.q(sql`select g.user_id::text as id from guardian_student_links l join guardians g on g.id = l.guardian_id
      join students s on s.id = l.student_id where s.user_id = ${input.studentUserId} and l.status = 'verified'`);
    for (const uid of [input.studentUserId, ...guardians.map((g) => g.id)]) {
      await this.notifier.notify({ instituteId: ctx.instituteId!, userId: uid, type: "teacher_feedback", dedupeKey: `feedback:${row.id}:${uid}`,
        title: `New feedback from ${ctx.name}`, body: input.body.slice(0, 140), channels: ["in_app"] });
    }
    return row;
  }

  students(ctx: RequestCtx) {
    this.requireStaff(ctx);
    return this.q(sql`select s.user_id::text as "studentUserId", u.name, s.roll_no as "rollNo" from students s join users u on u.id = s.user_id
      where s.institute_id = ${ctx.instituteId} order by u.name limit 300`);
  }

  // ---- practice: answer keys never leave the server until the student submits an answer ----
  async practiceTopics(ctx: RequestCtx) {
    return this.q(sql`select n.id::text as id, n.name, count(qt.question_id)::int as count from syllabus_nodes n
      join question_topics qt on qt.topic_id = n.id join questions q on q.id = qt.question_id and q.type <> 'subjective'
      where n.level = 'topic' and n.institute_id = ${ctx.instituteId} group by n.id, n.name order by n.name`);
  }

  async practiceSet(ctx: RequestCtx, topicId: string | undefined, count: number) {
    const n = Math.min(Math.max(count || 5, 1), 15);
    const list = await this.q(sql`select q.id::text as id, q.code, q.difficulty, v.payload from questions q
      join question_versions v on v.question_id = q.id and v.version = q.current_version
      ${topicId ? sql`join question_topics qt on qt.question_id = q.id and qt.topic_id = ${topicId}` : sql``}
      where q.institute_id = ${ctx.instituteId} and q.type <> 'subjective' order by random() limit ${n}`);
    return list.map((r) => {
      const p = r.payload;
      return { id: r.id, code: r.code, difficulty: r.difficulty, type: p.type, stem: p.stem, options: p.options ?? null, multi: p.type === "mcq_multi" };
    });
  }

  async practiceCheck(ctx: RequestCtx, input: z.infer<typeof checkInput>) {
    const [r] = await this.q(sql`select v.payload from questions q join question_versions v on v.question_id = q.id and v.version = q.current_version
      where q.id = ${input.questionId} and q.institute_id = ${ctx.instituteId}`);
    if (!r) throw new NotFoundException();
    const p = r.payload;
    const given = Array.isArray(input.answer) ? input.answer : [input.answer];
    let correct = false;
    let correctAnswer: unknown;
    if (p.type === "numeric") {
      const x = Number(given[0]);
      const { answer, tolerance = 0, toleranceKind = "absolute" } = p.numeric;
      const tol = toleranceKind === "percent" ? (Math.abs(answer) * tolerance) / 100 : tolerance;
      correct = Number.isFinite(x) && Math.abs(x - answer) <= tol + 1e-9;
      correctAnswer = answer;
    } else {
      correct = [...given].sort().join(",") === [...p.correct].sort().join(",");
      correctAnswer = p.correct;
    }
    await this.q(sql`insert into practice_attempts (institute_id, student_user_id, question_id, correct) values (${ctx.instituteId}, ${ctx.userId}, ${input.questionId}, ${correct})`);
    return { correct, correctAnswer, explanation: p.explanation ?? null };
  }

  async practiceStats(ctx: RequestCtx) {
    const [r] = await this.q(sql`select count(*)::int attempted, count(*) filter (where correct)::int correct from practice_attempts where student_user_id = ${ctx.userId}`);
    return r;
  }
}
