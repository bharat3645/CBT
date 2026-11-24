import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import { attempts, attemptAnswers, tests } from '@cbt/db/schema/exams';
import { questions, questionVersions } from '@cbt/db/schema/questions';
import {
  evaluations, evaluationItems, resultSettings, answerKeyRevisions,
} from '@cbt/db/schema/results';
import { notifications } from '@cbt/db/schema/notifications';
import {
  evaluate, payloadToKey, applyRevisions, dedupeKey,
  type Answer, type PayloadLike, type QuestionKey, type KeyRevision,
} from '@cbt/marking';
import { QUEUES, type EvaluateJob, type RankJob } from '@cbt/contracts/results';

export const EVALUATE_QUEUE = QUEUES.evaluate;

export interface EvaluateDeps {
  db: any; // Drizzle instance (owner connection; the job sets tenant explicitly via institute_id predicates)
  enqueueRank: (job: RankJob) => Promise<void>;
  now?: () => Date;
  /** Which batch the student sat this test in. Default: the test's only batch, else null. */
  resolveBatchId?: (studentId: string, test: { batchIds: string[] }) => Promise<string | null>;
}

export type EvaluateOutcome =
  | { status: 'evaluated'; evaluationId: string; version: number; score: number }
  | { status: 'unchanged'; version: number }
  | { status: 'skipped'; reason: string };

const SUBMITTED = ['submitted', 'auto_submitted', 'flagged'];

/**
 * Marking scheme for a test: the preset marking (e.g. NTA +4 / -1) is frozen on test.config and overrides the
 * per-question defaults; partial-marking rules come from the result settings.
 */
export function schemeFor(test: { config?: unknown }, settings: { partial?: unknown }) {
  const marking = (test.config as { marking?: { correct?: number; wrong?: number } } | null)?.marking;
  return { correct: marking?.correct, wrong: marking?.wrong, partial: settings.partial ?? undefined } as {
    correct?: number; wrong?: number; partial?: any;
  };
}

/** Build marking keys for a test at a given key version (reproducible: payload + revisions <= keyVersion). */
export async function loadKeys(db: any, instituteId: string, test: any, keyVersion: number, scheme: { correct?: number; wrong?: number; partial?: any }) {
  const sections = test.sections as { name: string; questionIds: string[] }[];
  const qids = sections.flatMap((s) => s.questionIds);
  const qrows = await db.select({ id: questions.id, v: questions.currentVersion }).from(questions)
    .where(and(eq(questions.instituteId, instituteId), inArray(questions.id, qids)));
  const vrows = await db.select({ questionId: questionVersions.questionId, version: questionVersions.version, payload: questionVersions.payload })
    .from(questionVersions).where(and(eq(questionVersions.instituteId, instituteId), inArray(questionVersions.questionId, qids)));
  const current = new Map<string, any>();
  for (const q of qrows) {
    const v = vrows.find((r: any) => r.questionId === q.id && r.version === q.v);
    if (v) current.set(q.id, v.payload);
  }
  const revs: KeyRevision[] = (await db.select().from(answerKeyRevisions)
    .where(and(eq(answerKeyRevisions.testId, test.id), eq(answerKeyRevisions.instituteId, instituteId))))
    .map((r: any) => ({ keyVersion: r.keyVersion, questionId: r.questionId, change: r.change }));

  const keys: QuestionKey[] = [];
  for (const s of sections) {
    for (const qid of s.questionIds) {
      const payload = current.get(qid) as PayloadLike | undefined;
      if (!payload) throw new Error(`Question ${qid} missing for test ${test.id}`);
      const { payload: p, dropped } = applyRevisions(qid, payload, revs, keyVersion);
      const key = payloadToKey(qid, s.name, p, { correct: scheme.correct, wrong: scheme.wrong, partial: scheme.partial ?? undefined }, dropped);
      if (key) keys.push(key);
    }
  }
  return keys;
}

export async function evaluateAttempt(deps: EvaluateDeps, job: EvaluateJob): Promise<EvaluateOutcome> {
  const { db } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const [attempt] = await db.select().from(attempts)
    .where(and(eq(attempts.id, job.attemptId), eq(attempts.instituteId, job.instituteId)));
  if (!attempt) return { status: 'skipped', reason: 'attempt not found' };
  if (!SUBMITTED.includes(attempt.status)) return { status: 'skipped', reason: 'attempt not submitted' };

  const [test] = await db.select().from(tests).where(and(eq(tests.id, attempt.testId), eq(tests.instituteId, job.instituteId)));
  if (!test) return { status: 'skipped', reason: 'test not found' };

  await db.insert(resultSettings).values({ testId: test.id, instituteId: job.instituteId }).onConflictDoNothing();
  const [settings] = await db.select().from(resultSettings).where(eq(resultSettings.testId, test.id));

  const [prev] = await db.select().from(evaluations)
    .where(and(eq(evaluations.attemptId, attempt.id), eq(evaluations.isCurrent, true)));
  // Idempotent: same key + scheme version already evaluated.
  if (prev && prev.keyVersion === settings.keyVersion && prev.schemeVersion === settings.schemeVersion) {
    return { status: 'unchanged', version: prev.version };
  }

  const keys = await loadKeys(db, job.instituteId, test, settings.keyVersion, schemeFor(test, settings));
  const rows = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt.id));
  const answers: Answer[] = rows.map((r: any) => ({
    questionId: r.questionId,
    selected: r.value?.selected ?? [],
    numeric: r.value?.numeric ?? null,
    timeSpentSec: Math.round((r.timeSpentMs ?? 0) / 1000),
  }));

  const ev = evaluate({
    attemptId: attempt.id, keyVersion: settings.keyVersion, schemeVersion: settings.schemeVersion,
    version: prev ? prev.version + 1 : 1, questions: keys, answers,
  });

  const batchIds: string[] = (test.batchIds as string[]) ?? [];
  const batchId = deps.resolveBatchId
    ? await deps.resolveBatchId(attempt.studentId, { batchIds })
    : batchIds.length === 1 ? batchIds[0]! : null;

  const releaseNow = settings.releaseMode === 'immediate'
    || (settings.releaseMode === 'scheduled' && settings.releaseAt && settings.releaseAt <= now);
  // A re-evaluation of an already-released result stays released.
  const releasedAt = prev?.releasedAt ?? (releaseNow ? now : null);

  const evaluationId: string = await db.transaction(async (tx: any) => {
    if (prev) await tx.update(evaluations).set({ isCurrent: false }).where(eq(evaluations.id, prev.id));
    const [row] = await tx.insert(evaluations).values({
      instituteId: job.instituteId, attemptId: attempt.id, testId: test.id, studentId: attempt.studentId, batchId,
      attemptNo: 1, version: ev.version, keyVersion: ev.keyVersion, schemeVersion: ev.schemeVersion,
      score: ev.score, maxScore: ev.maxScore, correct: ev.correct, incorrect: ev.incorrect, partial: ev.partial,
      unanswered: ev.unanswered, accuracy: ev.accuracy, timeSpentSec: ev.timeSpentSec, sections: ev.sections,
      isCurrent: true, releasedAt,
    }).returning({ id: evaluations.id });
    if (ev.items.length) {
      await tx.insert(evaluationItems).values(ev.items.map((i) => ({
        evaluationId: row.id, instituteId: job.instituteId, attemptId: attempt.id, questionId: i.questionId,
        sectionId: i.sectionId, topicId: i.topicId, result: i.result, marks: i.marks, maxMarks: i.maxMarks,
        timeSpentSec: i.timeSpentSec,
      })));
    }
    // Notify the student once per (attempt, version); dedupe key makes re-runs harmless (AT-25).
    if (releasedAt && !prev?.releasedAt || job.reason === 'key_correction') {
      for (const channel of ['in_app', 'email'] as const) {
        await tx.insert(notifications).values({
          instituteId: job.instituteId, userId: attempt.studentId,
          type: job.reason === 'key_correction' ? 'result_revised' : 'result_released', channel,
          dedupeKey: dedupeKey([job.reason === 'key_correction' ? 'result_revised' : 'result_released', attempt.id, ev.version, channel]),
          title: job.reason === 'key_correction' ? `Your result for "${test.title}" was updated` : `Your result for "${test.title}" is ready`,
          body: `Score ${ev.score} / ${ev.maxScore}`,
          data: { attemptId: attempt.id, testId: test.id, version: ev.version },
        }).onConflictDoNothing();
      }
    }
    return row.id;
  });

  await deps.enqueueRank({ testId: test.id, instituteId: job.instituteId });
  return { status: 'evaluated', evaluationId, version: ev.version, score: ev.score };
}

export function createEvaluateWorker(connection: ConnectionOptions, deps: EvaluateDeps, concurrency = 8) {
  return new Worker<EvaluateJob>(EVALUATE_QUEUE, (job: Job<EvaluateJob>) => evaluateAttempt(deps, job.data), {
    connection, concurrency,
  });
}

/** Deterministic jobId = idempotent enqueue (a double submit never creates two jobs for the same reason). */
export async function enqueueEvaluate(queue: Queue, job: EvaluateJob, keyVersion = 0) {
  await queue.add('evaluate', job, {
    jobId: `eval-${job.attemptId}-${job.reason}-${keyVersion}`,
    attempts: 5, backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000, removeOnFail: 5000,
  });
}
