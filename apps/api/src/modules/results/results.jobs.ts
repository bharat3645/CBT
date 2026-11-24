import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUES, type EvaluateJob, type RankJob } from '@cbt/contracts/results';

export const RESULTS_JOBS = 'RESULTS_JOBS';

/** The API never evaluates inline; it enqueues. QUEUE_DRIVER=inline implementations (dev/tests) can supply their own. */
export interface ResultsJobs {
  evaluate(job: EvaluateJob, keyVersion?: number): Promise<void>;
  rank(job: RankJob): Promise<void>;
}

/**
 * Call from the exam engine right after an attempt is submitted (manual or auto-submit sweep):
 *   await jobs.evaluate({ attemptId, instituteId, reason: 'submit' })
 * jobId is deterministic so a double submit (AT-08) never evaluates twice.
 */
@Injectable()
export class BullResultsJobs implements ResultsJobs, OnModuleDestroy {
  private readonly connection = { url: process.env.VALKEY_URL ?? 'redis://localhost:6379' } as any;
  // Unit/integration tests must never enqueue into a real Valkey (a live worker would consume the fake jobs).
  private readonly disabled = process.env.NODE_ENV === 'test';
  private readonly evalQ = this.disabled ? null : new Queue(QUEUES.evaluate, { connection: this.connection });
  private readonly rankQ = this.disabled ? null : new Queue(QUEUES.rank, { connection: this.connection });

  async evaluate(job: EvaluateJob, keyVersion = 0) {
    if (!this.evalQ) return;
    await this.evalQ.add('evaluate', job, {
      jobId: `eval-${job.attemptId}-${job.reason}-${keyVersion}`,
      attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000,
    });
  }

  async rank(job: RankJob) {
    if (!this.rankQ) return;
    await this.rankQ.add('rank', job, {
      jobId: `rank-${job.testId}-${Math.floor(Date.now() / 5000)}`, delay: 3000,
      attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 200, removeOnFail: 1000,
    });
  }

  async onModuleDestroy() {
    await Promise.all([this.evalQ?.close(), this.rankQ?.close()]);
  }
}
