import { Inject, Injectable, Optional, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  DEFAULT_PRESETS, computeDeadline, remainingMs, isExpired, SUBMIT_GRACE_MS,
  type CreateTestInput, type AutosaveItem, type IncidentInput, type PresetConfig,
} from "@cbt/contracts/exams";
import { RESULTS_JOBS, type ResultsJobs } from "../results/results.jobs";
import { afterCommit } from "../../common/request-context";
import { questions, questionVersions } from "@cbt/db/schema/questions";
import { tests, attempts, attemptAnswers, attemptIncidents, examPresets } from "@cbt/db/schema/exams";
import { batches, enrolments, students } from "@cbt/db/schema/core";
import { evaluations } from "@cbt/db/schema/results";

export const EXAMS_DB = "EXAMS_DB"; // Drizzle instance provided by core's DB module
export const EXAMS_CLOCK = "EXAMS_CLOCK";
export type Clock = () => Date;
/**
 * `id` is the USER id (attempts.student_id and tests.created_by hold user ids). `batchIds` is the caller's
 * batch scope from the auth guard (teacher: batches taught). It is only consulted for role "teacher".
 */
export interface Actor { id: string; instituteId: string; role?: string; batchIds?: string[] }

export type WindowState = "scheduled" | "open" | "closed";
export type AttemptState = "not_started" | "in_progress" | "submitted";
export const windowStateOf = (t: { windowStart: Date; windowEnd: Date }, now: Date): WindowState =>
  now < t.windowStart ? "scheduled" : now > t.windowEnd ? "closed" : "open";

const questionCountOf = (sections: unknown) =>
  (sections as { questionIds?: string[] }[]).reduce((n, s) => n + (s.questionIds?.length ?? 0), 0);

/** tests.batch_ids contains at least one of `ids` (jsonb array of uuid strings). */
const batchOverlap = (ids: string[]): SQL =>
  ids.length
    ? sql`exists (select 1 from jsonb_array_elements_text(${tests.batchIds}) as bx(v) where bx.v in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}))`
    : sql`false`;
/** Empty batch_ids means "whole institute". */
const wholeInstitute = (): SQL => sql`jsonb_array_length(${tests.batchIds}) = 0`;

export function makeReceiptCode(attemptId: string, submittedAt: Date): string {
  return createHash("sha256").update(`${attemptId}:${submittedAt.toISOString()}`).digest("hex").slice(0, 12).toUpperCase();
}

@Injectable()
export class ExamsService {
  constructor(@Inject(EXAMS_DB) private readonly db: any, @Inject(EXAMS_CLOCK) private readonly now: Clock = () => new Date(),
    @Optional() @Inject(RESULTS_JOBS) private readonly jobs?: ResultsJobs) {}

  listPresets() {
    return Object.entries(DEFAULT_PRESETS).map(([key, p]) => ({ key, ...p }));
  }

  async resolveConfig(instituteId: string, key: string, overrides?: Partial<PresetConfig>): Promise<PresetConfig> {
    const [custom] = await this.db.select().from(examPresets)
      .where(and(eq(examPresets.key, key), eq(examPresets.instituteId, instituteId))).limit(1);
    const base = (custom?.config as PresetConfig) ?? (DEFAULT_PRESETS as any)[key]?.config;
    if (!base) throw new BadRequestException(`Unknown preset ${key}`);
    return { ...base, ...(overrides ?? {}) };
  }

  /** Batches the caller is enrolled in today (the student's profile is found via the user id). */
  async enrolledBatchIds(actor: Actor, now = this.now()): Promise<string[]> {
    const today = now.toISOString().slice(0, 10);
    const rows = await this.db.select({ batchId: enrolments.batchId }).from(enrolments)
      .innerJoin(students, eq(students.id, enrolments.studentId))
      .where(and(
        eq(students.userId, actor.id), eq(enrolments.instituteId, actor.instituteId),
        or(isNull(enrolments.startsOn), lte(enrolments.startsOn, today)),
        or(isNull(enrolments.endsOn), gte(enrolments.endsOn, today)),
      ));
    return rows.map((r: any) => r.batchId as string);
  }

  /** Unknown / foreign batch ids are rejected; a teacher may only target batches they teach. */
  private async assertBatchesAssignable(actor: Actor, batchIds: string[]) {
    if (batchIds.length === 0) return;
    const found = await this.db.select({ id: batches.id }).from(batches)
      .where(and(eq(batches.instituteId, actor.instituteId), inArray(batches.id, batchIds)));
    if (found.length !== batchIds.length) throw new BadRequestException("Unknown batch");
    if (actor.role === "teacher" && !batchIds.every((b) => actor.batchIds?.includes(b))) {
      throw new ForbiddenException("You can only assign tests to batches you teach");
    }
  }

  async createTest(actor: Actor, input: CreateTestInput) {
    if (new Date(input.windowEnd) <= new Date(input.windowStart)) throw new BadRequestException("windowEnd must be after windowStart");
    const batchIds = [...new Set(input.batchIds)];
    await this.assertBatchesAssignable(actor, batchIds);
    const config = await this.resolveConfig(actor.instituteId, input.presetKey, input.overrides);
    const [row] = await this.db.insert(tests).values({
      instituteId: actor.instituteId, paperId: input.paperId, title: input.title, presetKey: input.presetKey,
      config, sections: input.sections, batchIds, durationMinutes: input.durationMinutes,
      windowStart: new Date(input.windowStart), windowEnd: new Date(input.windowEnd),
      instructions: input.instructions, createdBy: actor.id,
    }).returning();
    return row;
  }

  async publishTest(actor: Actor, testId: string) {
    if (actor.role === "teacher") {
      const [t] = await this.db.select({ batchIds: tests.batchIds }).from(tests)
        .where(and(eq(tests.id, testId), eq(tests.instituteId, actor.instituteId))).limit(1);
      const scope = (t?.batchIds as string[] | undefined) ?? [];
      if (scope.some((b) => !actor.batchIds?.includes(b))) throw new ForbiddenException("You can only publish tests for batches you teach");
    }
    const [row] = await this.db.update(tests).set({ status: "published" })
      .where(and(eq(tests.id, testId), eq(tests.instituteId, actor.instituteId), eq(tests.status, "draft"))).returning();
    if (!row) throw new ConflictException("Test not found or not in draft");
    return row;
  }

  /** preset key -> display name (institute overrides win over the built-in presets). */
  private async presetNames(instituteId: string): Promise<Map<string, string>> {
    const names = new Map<string, string>(Object.entries(DEFAULT_PRESETS).map(([k, p]) => [k, p.name]));
    const custom = await this.db.select({ key: examPresets.key, name: examPresets.name }).from(examPresets)
      .where(eq(examPresets.instituteId, instituteId));
    for (const c of custom) names.set(c.key, c.name);
    return names;
  }

  /**
   * Staff view: every test of the institute (admin), or the tests a teacher created / that target the teacher's
   * batches / that target the whole institute. Newest window first.
   */
  async listTests(actor: Actor) {
    const now = this.now();
    const scope: (SQL | undefined)[] = [eq(tests.instituteId, actor.instituteId)];
    if (actor.role === "teacher") {
      scope.push(or(eq(tests.createdBy, actor.id), wholeInstitute(), batchOverlap(actor.batchIds ?? [])));
    }
    const rows = await this.db.select().from(tests).where(and(...scope)).orderBy(desc(tests.windowStart)).limit(500);
    if (rows.length === 0) return [];

    const counts = await this.db.select({
      testId: attempts.testId, total: sql<number>`count(*)::int`,
      submitted: sql<number>`(count(*) filter (where ${attempts.status} <> 'in_progress'))::int`,
    }).from(attempts)
      .where(and(eq(attempts.instituteId, actor.instituteId), inArray(attempts.testId, rows.map((r: any) => r.id))))
      .groupBy(attempts.testId);
    const countOf = new Map<string, { total: number; submitted: number }>(counts.map((c: any) => [c.testId, c]));

    const allBatchIds: string[] = [...new Set<string>(rows.flatMap((r: any) => r.batchIds as string[]))];
    const batchRows = allBatchIds.length
      ? await this.db.select({ id: batches.id, name: batches.name }).from(batches).where(inArray(batches.id, allBatchIds))
      : [];
    const batchName = new Map<string, string>(batchRows.map((b: any) => [b.id, b.name]));
    const presetName = await this.presetNames(actor.instituteId);

    return rows.map((t: any) => ({
      id: t.id, title: t.title, status: t.status as string, paperId: t.paperId,
      presetKey: t.presetKey as string, presetName: presetName.get(t.presetKey) ?? t.presetKey,
      durationMinutes: t.durationMinutes as number,
      windowStart: t.windowStart.toISOString(), windowEnd: t.windowEnd.toISOString(), windowState: windowStateOf(t, now),
      batchIds: t.batchIds as string[],
      batches: (t.batchIds as string[]).map((id) => ({ id, name: batchName.get(id) ?? id })),
      questionCount: questionCountOf(t.sections),
      attemptCount: countOf.get(t.id)?.total ?? 0, submittedCount: countOf.get(t.id)?.submitted ?? 0,
      createdBy: t.createdBy as string | null, createdAt: t.createdAt.toISOString(),
    }));
  }

  /**
   * Student view: published tests for the student's enrolled batches (or the whole institute) that are still
   * open / scheduled, plus every visible test the student already attempted. Includes the student's attempt state.
   */
  async listUpcoming(actor: Actor) {
    const now = this.now();
    const enrolled = await this.enrolledBatchIds(actor, now);
    const mine = await this.db.select().from(attempts)
      .where(and(eq(attempts.instituteId, actor.instituteId), eq(attempts.studentId, actor.id)));
    const attemptOf = new Map<string, any>(mine.map((a: any) => [a.testId, a]));

    const rows = await this.db.select().from(tests).where(and(
      eq(tests.instituteId, actor.instituteId), eq(tests.status, "published"),
      or(wholeInstitute(), batchOverlap(enrolled)),
      or(gte(tests.windowEnd, now), mine.length ? inArray(tests.id, mine.map((a: any) => a.testId)) : undefined),
    )).orderBy(tests.windowStart).limit(500);
    if (rows.length === 0) return [];

    const released = new Set<string>();
    if (mine.length) {
      const ev = await this.db.select({ attemptId: evaluations.attemptId }).from(evaluations).where(and(
        eq(evaluations.instituteId, actor.instituteId), eq(evaluations.studentId, actor.id), eq(evaluations.isCurrent, true),
        inArray(evaluations.attemptId, mine.map((a: any) => a.id)), lte(evaluations.releasedAt, now),
      ));
      for (const e of ev) released.add(e.attemptId);
    }
    const presetName = await this.presetNames(actor.instituteId);

    return rows.map((t: any) => {
      const a = attemptOf.get(t.id);
      // An in-progress attempt past its deadline is as good as submitted: the sweep finalises it.
      const attemptState: AttemptState = !a ? "not_started"
        : a.status === "in_progress" && !isExpired(a.deadline, now, SUBMIT_GRACE_MS) ? "in_progress" : "submitted";
      const windowState = windowStateOf(t, now);
      return {
        id: t.id, title: t.title, presetKey: t.presetKey as string, presetName: presetName.get(t.presetKey) ?? t.presetKey,
        durationMinutes: t.durationMinutes as number, questionCount: questionCountOf(t.sections),
        windowStart: t.windowStart.toISOString(), windowEnd: t.windowEnd.toISOString(), windowState,
        attemptState, attemptId: (a?.id as string | undefined) ?? null,
        resultAvailable: !!a && released.has(a.id),
        canStart: windowState === "open" && attemptState !== "submitted",
      };
    });
  }

  async startAttempt(actor: Actor, testId: string) {
    const now = this.now();
    const [test] = await this.db.select().from(tests).where(and(eq(tests.id, testId), eq(tests.instituteId, actor.instituteId))).limit(1);
    if (!test || test.status !== "published") throw new NotFoundException("Test not available");
    // Assigned to specific batches -> the student must be enrolled in one of them. Empty = whole institute.
    const scope = (test.batchIds as string[] | null) ?? [];
    if (scope.length > 0) {
      const mine = await this.enrolledBatchIds(actor, now);
      if (!scope.some((b) => mine.includes(b))) throw new ForbiddenException("This test is not assigned to your batch");
    }
    if (now < test.windowStart) throw new ForbiddenException("Test has not started");
    if (now > test.windowEnd) throw new ForbiddenException("Test window closed");

    const [existing] = await this.db.select().from(attempts)
      .where(and(eq(attempts.testId, testId), eq(attempts.studentId, actor.id))).limit(1);
    let attempt = existing;
    if (existing && existing.status !== "in_progress") throw new ConflictException("Attempt already submitted");
    if (!attempt) {
      const deadline = computeDeadline(now, test.durationMinutes, test.windowEnd);
      // unique(test_id, student_id) makes concurrent starts converge on one row
      [attempt] = await this.db.insert(attempts).values({
        instituteId: actor.instituteId, testId, studentId: actor.id, startedAt: now, deadline,
      }).onConflictDoNothing().returning();
      if (!attempt) [attempt] = await this.db.select().from(attempts).where(and(eq(attempts.testId, testId), eq(attempts.studentId, actor.id))).limit(1);
    }
    const answers = await this.db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt.id));
    return {
      attemptId: attempt.id, serverNow: now.toISOString(), deadline: attempt.deadline.toISOString(),
      remainingMs: remainingMs(attempt.deadline, now), config: test.config, sections: test.sections, title: test.title,
      resumedAnswers: answers.map((a: any) => ({ questionId: a.questionId, seq: a.seq, status: a.status, value: a.value, timeSpentMs: a.timeSpentMs })),
    };
  }

  private async ownAttempt(actor: Actor, attemptId: string) {
    const [a] = await this.db.select().from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.studentId, actor.id), eq(attempts.instituteId, actor.instituteId))).limit(1);
    if (!a) throw new NotFoundException("Attempt not found");
    return a;
  }

  /**
   * Questions of an attempt, in test order, built from the test's frozen question ids. Never includes
   * correct answers, explanations, marks or numeric tolerances.
   */
  async getAttemptQuestions(actor: Actor, attemptId: string) {
    const attempt = await this.ownAttempt(actor, attemptId);
    const [test] = await this.db.select().from(tests)
      .where(and(eq(tests.id, attempt.testId), eq(tests.instituteId, actor.instituteId))).limit(1);
    if (!test) throw new NotFoundException("Attempt not found");
    const flat: { id: string; section: number }[] = [];
    (test.sections as { questionIds: string[] }[]).forEach((s, section) => s.questionIds.forEach((id) => flat.push({ id, section })));
    if (flat.length === 0) return [];
    const ids = [...new Set(flat.map((f) => f.id))];
    const qs = await this.db.select().from(questions)
      .where(and(eq(questions.instituteId, actor.instituteId), inArray(questions.id, ids)));
    const versions = await this.db.select().from(questionVersions)
      .where(and(eq(questionVersions.instituteId, actor.instituteId), inArray(questionVersions.questionId, ids)));
    const payloadOf = new Map<string, any>();
    for (const q of qs) {
      const v = versions.find((x: any) => x.questionId === q.id && x.version === q.currentVersion);
      if (v) payloadOf.set(q.id, { type: q.type, p: v.payload });
    }
    const para = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
    return flat.flatMap(({ id, section }) => {
      const e = payloadOf.get(id);
      if (!e) return [];
      const options = e.type === "true_false"
        ? [{ id: "true", content: para("True") }, { id: "false", content: para("False") }]
        : (e.p.options ?? []).map((o: any) => ({ id: o.id, content: o.content }));
      return [{ id, section, type: e.type as string, stem: e.p.stem, options }];
    });
  }

  /** Idempotent: a row is written only when incoming seq > stored seq. Replays and reorderings are no-ops. */
  async autosave(actor: Actor, attemptId: string, items: AutosaveItem[]) {
    const now = this.now();
    const attempt = await this.ownAttempt(actor, attemptId);
    if (attempt.status !== "in_progress") throw new ConflictException("Attempt is closed");
    if (isExpired(attempt.deadline, now, SUBMIT_GRACE_MS)) throw new ConflictException("Time is up");
    let applied = 0;
    for (const it of items) {
      const res = await this.db.insert(attemptAnswers).values({
        attemptId, questionId: it.questionId, instituteId: actor.instituteId, seq: it.seq,
        status: it.status, value: it.value, timeSpentMs: it.timeSpentMs,
      }).onConflictDoUpdate({
        target: [attemptAnswers.attemptId, attemptAnswers.questionId],
        set: { seq: it.seq, status: it.status, value: it.value, timeSpentMs: it.timeSpentMs, updatedAt: now },
        setWhere: sql`${attemptAnswers.seq} < ${it.seq}`,
      }).returning({ q: attemptAnswers.questionId });
      applied += res.length;
    }
    return {
      applied, ignored: items.length - applied, highestSeq: Math.max(...items.map((i) => i.seq)),
      serverRemainingMs: remainingMs(attempt.deadline, now), status: attempt.status,
    };
  }

  async logIncident(actor: Actor, attemptId: string, inc: IncidentInput) {
    const attempt = await this.ownAttempt(actor, attemptId);
    if (attempt.status !== "in_progress") return { count: attempt.incidentCount, flagged: attempt.flagged };
    await this.db.insert(attemptIncidents).values({
      attemptId, instituteId: actor.instituteId, type: inc.type, occurredAt: new Date(inc.occurredAt),
      durationMs: inc.durationMs, detail: inc.detail,
    });
    const [test] = await this.db.select().from(tests).where(eq(tests.id, attempt.testId)).limit(1);
    const cfg = test.config as PresetConfig;
    const [upd] = await this.db.update(attempts).set({ incidentCount: sql`${attempts.incidentCount} + 1` })
      .where(eq(attempts.id, attemptId)).returning();
    const flagged = cfg.strictLevel !== "off" && cfg.maxIncidents > 0 && upd.incidentCount >= cfg.maxIncidents;
    if (flagged && !upd.flagged) await this.db.update(attempts).set({ flagged: true }).where(eq(attempts.id, attemptId));
    return { count: upd.incidentCount, flagged, strictLevel: cfg.strictLevel };
  }

  /** Submit is idempotent: a second call returns the same receipt. */
  async submit(actor: Actor, attemptId: string) {
    const attempt = await this.ownAttempt(actor, attemptId);
    return this.finalize(attempt, false);
  }

  async finalize(attempt: any, auto: boolean) {
    const now = this.now();
    if (attempt.status !== "in_progress") return this.receipt(attempt);
    const submittedAt = auto && attempt.deadline < now ? attempt.deadline : now;
    const code = makeReceiptCode(attempt.id, submittedAt);
    const [row] = await this.db.update(attempts)
      .set({ status: auto ? "auto_submitted" : "submitted", submittedAt, receiptCode: code })
      .where(and(eq(attempts.id, attempt.id), eq(attempts.status, "in_progress"))).returning();
    // Evaluation runs in the worker. Enqueue only on the transition, after the request tx commits; the jobId is
    // deterministic, so the worker sweep or a retry can never evaluate the same attempt twice.
    if (row && this.jobs) {
      const jobs = this.jobs;
      await afterCommit(() => jobs.evaluate({ attemptId: row.id, instituteId: row.instituteId, reason: "submit" }));
    }
    return this.receipt(row ?? (await this.db.select().from(attempts).where(eq(attempts.id, attempt.id)))[0]);
  }

  private async receipt(attempt: any) {
    const [test] = await this.db.select().from(tests).where(eq(tests.id, attempt.testId)).limit(1);
    const total = (test.sections as any[]).reduce((n, s) => n + s.questionIds.length, 0);
    const answers = await this.db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt.id));
    const answered = answers.filter((a: any) => a.status === "answered" || a.status === "answered_marked").length;
    return {
      attemptId: attempt.id, receiptCode: attempt.receiptCode, submittedAt: attempt.submittedAt.toISOString(),
      answeredCount: answered, totalQuestions: total, auto: attempt.status === "auto_submitted",
    };
  }

  /** Same logic as the worker sweep; kept here for tests and manual admin triggers. */
  async sweepExpired(limit = 200) {
    const now = this.now();
    const rows = await this.db.select().from(attempts)
      .where(and(eq(attempts.status, "in_progress"), sql`${attempts.deadline} + interval '5 seconds' < ${now}`)).limit(limit);
    for (const a of rows) await this.finalize(a, true);
    return rows.length;
  }
}
