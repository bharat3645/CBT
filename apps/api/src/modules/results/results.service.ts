import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { RANK_LABEL, type KeyCorrectionsInput, type ResultSettingsInput, type ResultView } from '@cbt/contracts/results';
import { attempts, tests } from '@cbt/db/schema/exams';
import { answerKeyRevisions, evaluations, rankings, resultSettings } from '@cbt/db/schema/results';
import { notifications } from '@cbt/db/schema/notifications';
import { accuracyPct, dedupeKey, recommend } from '@cbt/marking';
import { RESULTS_CLOCK, RESULTS_DB, isStaff, linkedChildUserIds, requireStaff, type Actor } from './actor';
import { RESULTS_JOBS, type ResultsJobs } from './results.jobs';
import { attemptTopicStats, studentTopicStats, scoreTrend } from '../analytics/analytics.queries';
import { PdfService } from './pdf.service';
import { renderReportHtml } from './report-template';

@Injectable()
export class ResultsService {
  constructor(
    @Inject(RESULTS_DB) private readonly db: any,
    @Inject(RESULTS_JOBS) private readonly jobs: ResultsJobs,
    private readonly pdf: PdfService,
    @Inject(RESULTS_CLOCK) private readonly now: () => Date = () => new Date(),
  ) {}

  /** Students see only their own, RELEASED result. Staff see everything in their institute. */
  private async currentEvaluation(actor: Actor, attemptId: string) {
    const [ev] = await this.db.select().from(evaluations).where(and(
      eq(evaluations.attemptId, attemptId), eq(evaluations.instituteId, actor.instituteId), eq(evaluations.isCurrent, true),
    ));
    // 404, not 403: never confirm that another student's attempt exists (AT-15 pattern).
    if (!ev) throw new NotFoundException('Result not found');
    if (!isStaff(actor)) {
      const own = ev.studentId === actor.id
        || (actor.role === 'parent' && (await linkedChildUserIds(this.db, actor.id, actor.instituteId)).includes(ev.studentId));
      if (!own) throw new NotFoundException('Result not found');
      if (!ev.releasedAt || ev.releasedAt > this.now()) throw new ForbiddenException('Result not released yet');
    }
    return ev;
  }

  async getResult(actor: Actor, attemptId: string): Promise<ResultView> {
    const ev = await this.currentEvaluation(actor, attemptId);
    const [test] = await this.db.select({ title: tests.title }).from(tests).where(eq(tests.id, ev.testId));
    const [topicRows, rankRows, versions, trend] = await Promise.all([
      attemptTopicStats(this.db, actor.instituteId, ev.id),
      this.db.select().from(rankings).where(and(eq(rankings.attemptId, ev.attemptId), eq(rankings.instituteId, actor.instituteId))),
      this.db.select({
        version: evaluations.version, keyVersion: evaluations.keyVersion, score: evaluations.score, evaluatedAt: evaluations.evaluatedAt,
      }).from(evaluations).where(eq(evaluations.attemptId, ev.attemptId)).orderBy(desc(evaluations.version)),
      scoreTrend(this.db, actor.instituteId, ev.studentId, 6),
    ]);
    // Recommendations come from the student's recent tests, not just this one (needs >= 5 attempts per topic).
    const stats = await studentTopicStats(this.db, actor.instituteId, ev.studentId);
    return {
      attemptId: ev.attemptId, testId: ev.testId, testTitle: test?.title,
      version: ev.version, keyVersion: ev.keyVersion, schemeVersion: ev.schemeVersion,
      score: ev.score, maxScore: ev.maxScore, correct: ev.correct, incorrect: ev.incorrect, partial: ev.partial,
      unanswered: ev.unanswered, accuracy: ev.accuracy, timeSpentSec: ev.timeSpentSec, sections: ev.sections,
      topics: topicRows.map((t: any) => ({ ...t, accuracy: accuracyPct(t.correct, t.attempted) })),
      ranks: rankRows.map((r: any) => ({ scope: r.scope, rank: r.rank, participants: r.participants, percentile: r.percentile })),
      rankLabel: RANK_LABEL,
      recommendations: recommend(stats),
      previousTests: trend.filter((t: any) => t.testId !== ev.testId).map((t: any) => ({ testId: t.testId, title: t.title, scorePct: t.scorePct, at: t.at })),
      versions: versions.map((v: any) => ({ ...v, evaluatedAt: new Date(v.evaluatedAt).toISOString() })),
    };
  }

  /**
   * Own released results. A parent gets their linked children's (all of them, or one via `childUserId`, which must be a
   * verified link: anything else yields 404 so ids of other families are never confirmed).
   */
  async listMine(actor: Actor, childUserId?: string) {
    let owners = [actor.id];
    if (actor.role === 'parent') {
      const kids = await linkedChildUserIds(this.db, actor.id, actor.instituteId);
      if (childUserId && !kids.includes(childUserId)) throw new NotFoundException('Child not found');
      owners = childUserId ? [childUserId] : kids;
      if (!owners.length) return [];
    }
    return this.db.select({
      attemptId: evaluations.attemptId, testId: evaluations.testId, studentId: evaluations.studentId, title: tests.title,
      score: evaluations.score, maxScore: evaluations.maxScore, evaluatedAt: evaluations.evaluatedAt,
    }).from(evaluations).innerJoin(tests, eq(tests.id, evaluations.testId))
      .where(and(
        inArray(evaluations.studentId, owners), eq(evaluations.instituteId, actor.instituteId), eq(evaluations.isCurrent, true),
        sql`${evaluations.releasedAt} is not null and ${evaluations.releasedAt} <= ${this.now()}`,
      )).orderBy(desc(evaluations.evaluatedAt));
  }

  async leaderboard(actor: Actor, testId: string, scope: 'test' | 'batch', scopeId?: string) {
    requireStaff(actor);
    const rows = await this.db.select({
      rank: rankings.rank, studentId: rankings.studentId, percentile: rankings.percentile, score: evaluations.score,
    }).from(rankings)
      .innerJoin(evaluations, and(eq(evaluations.attemptId, rankings.attemptId), eq(evaluations.isCurrent, true)))
      .where(and(
        eq(rankings.testId, testId), eq(rankings.instituteId, actor.instituteId), eq(rankings.scope, scope),
        scopeId ? eq(rankings.scopeId, scopeId) : undefined,
      )).orderBy(rankings.rank);
    return { label: RANK_LABEL, rows };
  }

  async setSettings(actor: Actor, testId: string, input: ResultSettingsInput) {
    requireStaff(actor);
    const values = {
      releaseMode: input.releaseMode, releaseAt: input.releaseAt ? new Date(input.releaseAt) : null,
      tieBreakers: input.tieBreakers, minPercentileParticipants: input.minPercentileParticipants,
      partial: input.partial ?? null, updatedAt: this.now(),
    };
    await this.db.insert(resultSettings).values({ testId, instituteId: actor.instituteId, ...values })
      .onConflictDoUpdate({ target: resultSettings.testId, set: values, setWhere: eq(resultSettings.instituteId, actor.instituteId) });
    await this.jobs.rank({ testId, instituteId: actor.instituteId }); // tie-breakers may change ranks
    return { ok: true };
  }

  /** Manual / scheduled release: flips released_at on current evaluations and notifies students once. */
  async release(actor: Actor, testId: string) {
    requireStaff(actor);
    const now = this.now();
    const released = await this.db.update(evaluations).set({ releasedAt: now })
      .where(and(eq(evaluations.testId, testId), eq(evaluations.instituteId, actor.instituteId), eq(evaluations.isCurrent, true), sql`${evaluations.releasedAt} is null`))
      .returning({ attemptId: evaluations.attemptId, studentId: evaluations.studentId, version: evaluations.version });
    for (const r of released) {
      for (const channel of ['in_app', 'email'] as const) {
        await this.db.insert(notifications).values({
          instituteId: actor.instituteId, userId: r.studentId, type: 'result_released', channel,
          dedupeKey: dedupeKey(['result_released', r.attemptId, r.version, channel]),
          title: 'Your test result is ready', body: '', data: { attemptId: r.attemptId, testId, version: r.version },
        }).onConflictDoNothing();
      }
    }
    return { released: released.length };
  }

  /**
   * Answer-key dispute (FR-056, AT-13): records the correction, bumps key_version, and re-evaluates every
   * submitted attempt. Old result versions are kept; ranks are recomputed by the rank job after each evaluation.
   */
  async correctKey(actor: Actor, testId: string, input: KeyCorrectionsInput) {
    requireStaff(actor);
    const [test] = await this.db.select({ id: tests.id }).from(tests)
      .where(and(eq(tests.id, testId), eq(tests.instituteId, actor.instituteId)));
    if (!test) throw new NotFoundException('Test not found');

    const keyVersion: number = await this.db.transaction(async (tx: any) => {
      await tx.insert(resultSettings).values({ testId, instituteId: actor.instituteId }).onConflictDoNothing();
      const [s] = await tx.update(resultSettings).set({ keyVersion: sql`${resultSettings.keyVersion} + 1`, updatedAt: this.now() })
        .where(and(eq(resultSettings.testId, testId), eq(resultSettings.instituteId, actor.instituteId)))
        .returning({ keyVersion: resultSettings.keyVersion });
      await tx.insert(answerKeyRevisions).values(input.corrections.map((c) => ({
        instituteId: actor.instituteId, testId, keyVersion: s.keyVersion, questionId: c.questionId,
        change: { correct: c.correct, numeric: c.numeric, dropped: c.dropped }, reason: c.reason, createdBy: actor.id,
      })));
      return s.keyVersion;
    });

    const submitted = await this.db.select({ id: attempts.id }).from(attempts).where(and(
      eq(attempts.testId, testId), eq(attempts.instituteId, actor.instituteId),
      sql`${attempts.status} in ('submitted','auto_submitted','flagged')`,
    ));
    for (const a of submitted) {
      await this.jobs.evaluate({ attemptId: a.id, instituteId: actor.instituteId, reason: 'key_correction' }, keyVersion);
    }
    return { keyVersion, reevaluating: submitted.length };
  }

  /** Permission-checked server-side PDF (SRS 10.4). */
  async reportPdf(actor: Actor, attemptId: string): Promise<Buffer> {
    const view = await this.getResult(actor, attemptId); // enforces ownership + release
    return this.pdf.htmlToPdf(renderReportHtml(view));
  }
}
