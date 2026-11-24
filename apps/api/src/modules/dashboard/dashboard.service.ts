import { Inject, Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import type {
  AdminDashboardData, ChildSummary, DashboardBadges, DashboardBatchPerf, DashboardData, DashboardOwnResult, DashboardPaper,
  DashboardTest, DashboardTestResult, ParentDashboardData, StudentDashboardData, TeacherDashboardData,
} from "@cbt/contracts/dashboard";
import type { Db } from "@cbt/db";
import { DB } from "../../common/db/db.module";
import type { RequestCtx } from "../../common/request-context";
import { studentTopicStats } from "../analytics/analytics.queries";
import { completionPercent, topicIdsUnder } from "../syllabus/syllabus-logic";

const rows = (res: any): any[] => (Array.isArray(res) ? res : res?.rows ?? []);
const iso = (v: unknown) => (v instanceof Date ? v : new Date(v as string)).toISOString();
const int = (v: unknown) => Number(v ?? 0);
const pct1 = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10) / 10);
const idList = (ids: string[]): SQL => sql.join(ids.map((i) => sql`${i}`), sql`, `);

/** published tests whose window overlaps the current calendar week */
const THIS_WEEK = sql`t.window_start < date_trunc('week', now()) + interval '7 days' and t.window_end >= date_trunc('week', now())`;
const LIVE_NOW = sql`t.window_start <= now() and t.window_end >= now()`;
/** an evaluation counts for a student/parent only once it is released */
const RELEASED = sql`e.is_current and e.released_at is not null and e.released_at <= now()`;
const PCT = sql`case when e.max_score = 0 then 0 else e.score / e.max_score * 100 end`;

/** Papers still on their way to approval, with the same counts the paper list shows. */
const PAPER_COLS = sql`
  p.id, p.title, p.status, p.created_at,
  (select count(*) from ingestion_drafts d where d.paper_id = p.id)::int as question_count,
  (select count(*) from ingestion_drafts d where d.paper_id = p.id and exists (
     select 1 from jsonb_array_elements(d.flags) f where f->>'severity' = 'error' and coalesce((f->>'resolved')::boolean, false) = false))::int as open_flag_count,
  (select count(*) from ingestion_drafts d where d.paper_id = p.id
     and coalesce(nullif(btrim(d.answer), ''), nullif(btrim(p.answer_key ->> d.number::text), '')) is null)::int as missing_key_count`;

@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private q(query: SQL): Promise<any[]> {
    return (this.db as any).execute(query).then(rows);
  }

  async get(ctx: RequestCtx, childId?: string): Promise<DashboardData> {
    const user = { id: ctx.userId, name: ctx.name, email: ctx.email };
    if (!ctx.instituteId || ctx.role === "super_admin") {
      return {
        role: "super_admin", user, institute: null, generatedAt: new Date().toISOString(),
        badges: { papersToReview: 0, flags: 0, upcomingTests: 0, unreadNotifications: 0 },
      };
    }
    const [institute, unread] = await Promise.all([this.institute(ctx.instituteId), this.unread(ctx)]);
    const base = { user, institute, generatedAt: new Date().toISOString() };
    switch (ctx.role) {
      case "institute_admin": return this.admin(ctx, base, unread);
      case "teacher": return this.teacher(ctx, base, unread);
      case "student": return this.student(ctx, base, unread);
      default: return this.parent(ctx, base, unread, childId);
    }
  }

  // ---------------------------------------------------------------- shared helpers
  private async institute(id: string) {
    const [r] = await this.q(sql`select id, name, logo, brand_color from institutes where id = ${id}`);
    return r ? { id: r.id as string, name: r.name as string, logo: (r.logo as string | null) ?? null, brandColor: (r.brand_color as string | null) ?? null } : null;
  }

  private async unread(ctx: RequestCtx) {
    const [r] = await this.q(sql`select count(*)::int as n from notifications where institute_id = ${ctx.instituteId} and user_id = ${ctx.userId} and channel = 'in_app' and read_at is null`);
    return int(r?.n);
  }

  private async paperBadges(inst: string): Promise<Pick<DashboardBadges, "papersToReview" | "flags">> {
    const [r] = await this.q(sql`
      select
        count(*) filter (where p.status not in ('approved', 'rejected'))::int as to_review,
        count(*) filter (where p.status = 'failed' or exists (
          select 1 from ingestion_drafts d where d.paper_id = p.id and exists (
            select 1 from jsonb_array_elements(d.flags) f where f->>'severity' = 'error' and coalesce((f->>'resolved')::boolean, false) = false)))::int as flagged
      from ingestion_papers p where p.institute_id = ${inst}`);
    return { papersToReview: int(r?.to_review), flags: int(r?.flagged) };
  }

  private async papers(inst: string, limit: number): Promise<DashboardPaper[]> {
    const list = await this.q(sql`
      select ${PAPER_COLS} from ingestion_papers p
      where p.institute_id = ${inst} and p.status not in ('approved', 'rejected')
      order by (p.status = 'failed') desc, p.created_at desc limit ${limit}`);
    return list.map((p) => ({
      id: p.id, title: p.title, status: p.status, questionCount: int(p.question_count),
      openFlagCount: int(p.open_flag_count), missingKeyCount: int(p.missing_key_count), createdAt: iso(p.created_at),
    }));
  }

  private async withBatchNames(list: any[]): Promise<DashboardTest[]> {
    const ids = [...new Set(list.flatMap((t) => (Array.isArray(t.batch_ids) ? (t.batch_ids as string[]) : [])))];
    const names = new Map<string, string>();
    if (ids.length) for (const b of await this.q(sql`select id, name from batches where id in (${idList(ids)})`)) names.set(b.id, b.name);
    return list.map((t) => ({
      id: t.id, title: t.title, windowStart: iso(t.window_start), windowEnd: iso(t.window_end), durationMinutes: int(t.duration_minutes),
      batchNames: (Array.isArray(t.batch_ids) ? (t.batch_ids as string[]) : []).map((id) => names.get(id) ?? "Unknown batch"),
    }));
  }

  /**
   * Published tests that have not closed, optionally limited to tests aimed at `batchIds` (or created by `createdBy`).
   * A test with no batches is open to the whole institute (the exam engine only checks the institute).
   */
  private async upcoming(inst: string, opts: { batchIds?: string[]; createdBy?: string; excludeSubmittedBy?: string; limit: number }) {
    const scope: SQL[] = [];
    if (opts.batchIds) {
      scope.push(opts.batchIds.length
        ? sql`(jsonb_array_length(t.batch_ids) = 0 or exists (select 1 from jsonb_array_elements_text(t.batch_ids) b(id) where b.id in (${idList(opts.batchIds)})))`
        : sql`jsonb_array_length(t.batch_ids) = 0`);
    }
    const scopeSql = scope.length
      ? opts.createdBy ? sql`and (${scope[0]} or t.created_by = ${opts.createdBy})` : sql`and ${scope[0]}`
      : sql``;
    const notDone = opts.excludeSubmittedBy
      ? sql`and not exists (select 1 from attempts a where a.test_id = t.id and a.student_id = ${opts.excludeSubmittedBy} and a.status <> 'in_progress')`
      : sql``;
    const list = await this.q(sql`
      select t.id, t.title, t.window_start, t.window_end, t.duration_minutes, t.batch_ids from tests t
      where t.institute_id = ${inst} and t.status = 'published' and t.window_end >= now() ${scopeSql} ${notDone}
      order by t.window_start asc limit ${opts.limit}`);
    return this.withBatchNames(list);
  }

  // ---------------------------------------------------------------- admin
  private async admin(ctx: RequestCtx, base: Pick<AdminDashboardData, "user" | "institute" | "generatedAt">, unread: number): Promise<AdminDashboardData> {
    const inst = ctx.instituteId!;
    const [[c], pb, upcomingTests, needsAttention, recent] = await Promise.all([
      this.q(sql`
        select
          (select count(*) from memberships where institute_id = ${inst} and role = 'student' and status = 'active')::int as students,
          (select count(*) from memberships where institute_id = ${inst} and role = 'teacher' and status = 'active')::int as teachers,
          (select count(*) from memberships where institute_id = ${inst} and role = 'parent' and status = 'active')::int as parents,
          (select count(*) from batches where institute_id = ${inst} and status = 'active')::int as batches,
          (select count(*) from tests t where t.institute_id = ${inst} and t.status = 'published' and ${THIS_WEEK})::int as tests_week,
          (select count(*) from tests t where t.institute_id = ${inst} and t.status = 'published' and ${LIVE_NOW})::int as live,
          (select count(*) from evaluations e where e.institute_id = ${inst} and e.is_current)::int as evaluated,
          (select avg(${PCT}) from evaluations e where e.institute_id = ${inst} and e.is_current) as avg_pct`),
      this.paperBadges(inst),
      this.upcoming(inst, { limit: 5 }),
      this.papers(inst, 5),
      this.q(sql`
        select e.test_id, t.title, count(*)::int as participants, avg(${PCT}) as avg_pct, max(e.evaluated_at) as at
        from evaluations e left join tests t on t.id = e.test_id
        where e.institute_id = ${inst} and e.is_current
        group by e.test_id, t.title order by max(e.evaluated_at) desc limit 5`),
    ]);
    const recentResults: DashboardTestResult[] = recent.map((r) => ({
      testId: r.test_id, title: r.title ?? "Untitled test", participants: int(r.participants), avgPct: pct1(r.avg_pct) ?? 0, at: iso(r.at),
    }));
    return {
      ...base, role: "institute_admin",
      badges: { ...pb, upcomingTests: 0, unreadNotifications: unread },
      stats: {
        activeStudents: int(c.students), teachers: int(c.teachers), parents: int(c.parents), batches: int(c.batches),
        testsThisWeek: int(c.tests_week), liveNow: int(c.live),
        papersAwaitingApproval: pb.papersToReview, papersWithFlags: pb.flags,
        avgScorePct: pct1(c.avg_pct), evaluatedAttempts: int(c.evaluated),
      },
      upcomingTests, needsAttention, recentResults,
    };
  }

  // ---------------------------------------------------------------- teacher
  private async teacher(ctx: RequestCtx, base: Pick<TeacherDashboardData, "user" | "institute" | "generatedAt">, unread: number): Promise<TeacherDashboardData> {
    const inst = ctx.instituteId!;
    const mine = ctx.batchIds;
    const mineSql = mine.length ? idList(mine) : sql`null::uuid`;
    const testScope = mine.length
      ? sql`and (jsonb_array_length(t.batch_ids) = 0 or exists (select 1 from jsonb_array_elements_text(t.batch_ids) b(id) where b.id in (${idList(mine)})) or t.created_by = ${ctx.userId})`
      : sql`and (jsonb_array_length(t.batch_ids) = 0 or t.created_by = ${ctx.userId})`;
    const [[c], [oldest], pb, papersNeedingReview, upcomingTests, perf, batchRows] = await Promise.all([
      this.q(sql`
        select
          (select count(distinct student_id) from enrolments where institute_id = ${inst} and batch_id in (${mineSql}))::int as students,
          (select count(*) from tests t where t.institute_id = ${inst} and t.status = 'published' and ${THIS_WEEK} ${testScope})::int as tests_week,
          (select count(*) from tests t where t.institute_id = ${inst} and t.status = 'published' and ${LIVE_NOW} ${testScope})::int as live`),
      this.q(sql`select min(created_at) as oldest from ingestion_papers where institute_id = ${inst} and status not in ('approved', 'rejected')`),
      this.paperBadges(inst),
      this.papers(inst, 5),
      this.upcoming(inst, { batchIds: mine, createdBy: ctx.userId, limit: 5 }),
      mine.length
        ? this.q(sql`
            select e.batch_id, e.test_id, t.title, count(*)::int as participants, avg(${PCT}) as avg_pct, max(e.evaluated_at) as at
            from evaluations e left join tests t on t.id = e.test_id
            where e.institute_id = ${inst} and e.is_current and e.batch_id in (${mineSql})
            group by e.batch_id, e.test_id, t.title`)
        : Promise.resolve([]),
      mine.length ? this.q(sql`select id, name from batches where id in (${mineSql}) order by name`) : Promise.resolve([]),
    ]);
    const latest = new Map<string, any>();
    for (const r of perf) {
      const cur = latest.get(r.batch_id);
      if (!cur || new Date(r.at) > new Date(cur.at)) latest.set(r.batch_id, r);
    }
    const batchPerformance: DashboardBatchPerf[] = batchRows.map((b) => {
      const r = latest.get(b.id);
      return { batchId: b.id, name: b.name, testTitle: r?.title ?? null, avgPct: r ? pct1(r.avg_pct) : null, participants: r ? int(r.participants) : 0 };
    });
    const oldestDays = oldest?.oldest ? Math.max(0, Math.floor((Date.now() - new Date(oldest.oldest).getTime()) / 86_400_000)) : null;
    return {
      ...base, role: "teacher",
      badges: { ...pb, upcomingTests: 0, unreadNotifications: unread },
      stats: {
        batches: mine.length, students: int(c.students), papersToReview: pb.papersToReview, oldestPaperDays: oldestDays,
        testsThisWeek: int(c.tests_week), liveNow: int(c.live),
      },
      papersNeedingReview, batchPerformance, upcomingTests,
    };
  }

  // ---------------------------------------------------------------- student
  private ownResults(inst: string, userId: string, limit: number): Promise<DashboardOwnResult[]> {
    return this.q(sql`
      select e.attempt_id, e.test_id, t.title, e.score, e.max_score, ${PCT} as pct, e.evaluated_at as at,
        (select r.rank from rankings r where r.attempt_id = e.attempt_id and r.institute_id = ${inst} order by (r.scope = 'batch') desc, r.rank limit 1) as rank,
        (select r.participants from rankings r where r.attempt_id = e.attempt_id and r.institute_id = ${inst} order by (r.scope = 'batch') desc, r.rank limit 1) as participants
      from evaluations e left join tests t on t.id = e.test_id
      where e.institute_id = ${inst} and e.student_id = ${userId} and ${RELEASED}
      order by e.evaluated_at desc limit ${limit}`).then((list) => list.map((r) => ({
      attemptId: r.attempt_id, testId: r.test_id, title: r.title ?? "Untitled test", score: Number(r.score), maxScore: Number(r.max_score),
      pct: pct1(r.pct) ?? 0, at: iso(r.at), rank: r.rank == null ? null : int(r.rank), participants: r.participants == null ? null : int(r.participants),
    })));
  }

  private async resultTotals(inst: string, userId: string) {
    const [[a], [att]] = await Promise.all([
      this.q(sql`select count(*)::int as n, avg(${PCT}) as avg_pct, max(${PCT}) as best_pct from evaluations e where e.institute_id = ${inst} and e.student_id = ${userId} and ${RELEASED}`),
      this.q(sql`select count(*)::int as n from attempts where institute_id = ${inst} and student_id = ${userId} and status <> 'in_progress'`),
    ]);
    return { released: int(a?.n), avgPct: pct1(a?.avg_pct), bestPct: pct1(a?.best_pct), attempted: int(att?.n) };
  }

  private async student(ctx: RequestCtx, base: Pick<StudentDashboardData, "user" | "institute" | "generatedAt">, unread: number): Promise<StudentDashboardData> {
    const inst = ctx.instituteId!;
    const [totals, recentResults, upcomingTests, topicStats] = await Promise.all([
      this.resultTotals(inst, ctx.userId),
      this.ownResults(inst, ctx.userId, 5),
      this.upcoming(inst, { batchIds: ctx.batchIds, excludeSubmittedBy: ctx.userId, limit: 20 }),
      studentTopicStats(this.db, inst, ctx.userId).catch(() => []),
    ]);
    const weakTopics = topicStats
      .filter((t) => t.attempted > 0)
      .map((t) => ({ topicId: t.topicId, topicName: t.topicName, accuracy: Math.round((100 * t.correct) / t.attempted) }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3);
    const ranked = recentResults.find((r) => r.rank != null && r.participants != null);
    return {
      ...base, role: "student",
      badges: { papersToReview: 0, flags: 0, upcomingTests: upcomingTests.length, unreadNotifications: unread },
      stats: {
        testsAttempted: totals.attempted, resultsReleased: totals.released, avgScorePct: totals.avgPct, bestScorePct: totals.bestPct,
        classRank: ranked ? { rank: ranked.rank!, participants: ranked.participants!, testTitle: ranked.title } : null,
      },
      upcomingTests: upcomingTests.slice(0, 5), weakTopics, recentResults,
    };
  }

  // ---------------------------------------------------------------- parent
  /** Verified linked children (ctx.childStudentIds comes from verified guardian links only). */
  async children(ctx: RequestCtx): Promise<ChildSummary[]> {
    if (ctx.role !== "parent" || !ctx.childStudentIds.length) return [];
    const [kids, batchRows] = await Promise.all([
      this.q(sql`
        select s.id as student_id, s.user_id, u.name, s.roll_no from students s join users u on u.id = s.user_id
        where s.id in (${idList(ctx.childStudentIds)}) order by u.name`),
      this.q(sql`
        select e.student_id, b.id, b.name from enrolments e join batches b on b.id = e.batch_id
        where e.student_id in (${idList(ctx.childStudentIds)}) order by b.name`),
    ]);
    return kids.map((k) => ({
      studentId: k.student_id, userId: k.user_id, name: k.name, rollNo: k.roll_no ?? null,
      batches: batchRows.filter((b) => b.student_id === k.student_id).map((b) => ({ id: b.id, name: b.name })),
    }));
  }

  /** Syllabus completion for a set of batches: overall and per subject, averaged over the batches. */
  private async syllabusFor(inst: string, batchIds: string[]) {
    if (!batchIds.length) return { overall: null as number | null, bySubject: [] as { id: string; name: string; percent: number }[] };
    const [nodes, done] = await Promise.all([
      this.q(sql`select id, parent_id, level, name from syllabus_nodes where institute_id = ${inst}`),
      this.q(sql`select batch_id, topic_id from batch_topic_progress where institute_id = ${inst} and status = 'completed' and batch_id in (${idList(batchIds)})`),
    ]);
    const flat = nodes.map((n) => ({ id: n.id as string, parentId: (n.parent_id as string | null) ?? null, level: n.level, name: n.name as string, position: 0 }));
    const topics = flat.filter((n) => n.level === "topic").map((n) => n.id);
    if (!topics.length) return { overall: null, bySubject: [] };
    const doneBy = batchIds.map((b) => new Set(done.filter((d) => d.batch_id === b).map((d) => d.topic_id as string)));
    const avg = (ids: string[]) => Math.round(doneBy.reduce((s, set) => s + completionPercent(ids, set), 0) / doneBy.length);
    const bySubject = flat
      .filter((n) => n.level === "subject")
      .map((n) => ({ id: n.id, name: n.name, ids: topicIdsUnder(flat, n.id) }))
      .filter((s) => s.ids.length)
      .map((s) => ({ id: s.id, name: s.name, percent: avg(s.ids) }));
    return { overall: avg(topics), bySubject };
  }

  private async parent(ctx: RequestCtx, base: Pick<ParentDashboardData, "user" | "institute" | "generatedAt">, unread: number, childId?: string): Promise<ParentDashboardData> {
    const inst = ctx.instituteId!;
    const children = await this.children(ctx);
    const child = children.find((c) => c.studentId === childId) ?? children[0] ?? null;
    const badges = { papersToReview: 0, flags: 0, upcomingTests: 0, unreadNotifications: unread };
    if (!child) {
      return { ...base, role: "parent", badges, children, child: null, stats: { testsAttempted: 0, avgScorePct: null, latest: null, syllabusPercent: null }, recentResults: [], syllabusBySubject: [] };
    }
    const [totals, recentResults, syllabus] = await Promise.all([
      this.resultTotals(inst, child.userId),
      this.ownResults(inst, child.userId, 5),
      this.syllabusFor(inst, child.batches.map((b) => b.id)),
    ]);
    const latest = recentResults[0];
    return {
      ...base, role: "parent", badges, children, child,
      stats: {
        testsAttempted: totals.attempted, avgScorePct: totals.avgPct,
        latest: latest ? { title: latest.title, score: latest.score, maxScore: latest.maxScore, pct: latest.pct } : null,
        syllabusPercent: syllabus.overall,
      },
      recentResults, syllabusBySubject: syllabus.bySubject,
    };
  }
}
