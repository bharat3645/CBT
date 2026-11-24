import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { evaluations, rankings, resultSettings } from '@cbt/db/schema/results';
import { computeAllScopes, type RankEntry, type TieBreaker } from '@cbt/marking';
import { QUEUES, type RankJob } from '@cbt/contracts/results';

export const RANK_QUEUE = QUEUES.rank;

/**
 * Recompute test + batch ranks from CURRENT evaluation versions. Idempotent: delete + insert in one transaction.
 * Institute-level rank equals test-level here because a test is one paper for the whole institute.
 */
export async function computeRankings(db: any, job: RankJob): Promise<{ rows: number }> {
  const [settings] = await db.select().from(resultSettings).where(eq(resultSettings.testId, job.testId));
  const evs = await db.select().from(evaluations).where(and(
    eq(evaluations.testId, job.testId), eq(evaluations.instituteId, job.instituteId),
    eq(evaluations.isCurrent, true), eq(evaluations.attemptNo, 1),
  ));
  const entries: RankEntry[] = evs.map((e: any) => ({
    attemptId: e.attemptId, studentId: e.studentId, batchId: e.batchId, attemptNo: e.attemptNo,
    score: e.score, incorrect: e.incorrect,
    section1Score: (e.sections as { score: number }[])[0]?.score ?? 0,
    timeSpentSec: e.timeSpentSec,
  }));
  const rows = computeAllScopes(entries, {
    tieBreakers: (settings?.tieBreakers ?? []) as TieBreaker[],
    minParticipantsForPercentile: settings?.minPercentileParticipants ?? 30,
  });
  await db.transaction(async (tx: any) => {
    await tx.delete(rankings).where(and(eq(rankings.testId, job.testId), eq(rankings.instituteId, job.instituteId)));
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(rankings).values(rows.slice(i, i + 500).map((r) => ({
        instituteId: job.instituteId, testId: job.testId, scope: r.scope, scopeId: r.scopeId,
        attemptId: r.attemptId, studentId: r.studentId, rank: r.rank, percentile: r.percentile, participants: r.participants,
      })));
    }
  });
  return { rows: rows.length };
}

export function createRankWorker(connection: ConnectionOptions, db: any) {
  return new Worker<RankJob>(RANK_QUEUE, (job: Job<RankJob>) => computeRankings(db, job.data), {
    connection, concurrency: 2,
  });
}

/** One pending rank job per test: a burst of 500 evaluations collapses into a few recomputes. */
export async function enqueueRank(queue: Queue, job: RankJob) {
  const bucket = Math.floor(Date.now() / 5000); // coalesce within 5 s windows
  await queue.add('rank', job, {
    jobId: `rank-${job.testId}-${bucket}`, delay: 3000, attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 200, removeOnFail: 1000,
  });
}
