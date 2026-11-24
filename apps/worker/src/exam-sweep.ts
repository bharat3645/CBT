import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { attempts } from "@cbt/db/schema/exams";
import { SUBMIT_GRACE_MS } from "@cbt/contracts/exams";

export const EXAM_SWEEP_QUEUE = "exam-auto-submit-sweep";
export const SWEEP_EVERY_MS = 15_000; // PRD: every 10-30 s

export function receiptCode(attemptId: string, at: Date): string {
  return createHash("sha256").update(`${attemptId}:${at.toISOString()}`).digest("hex").slice(0, 12).toUpperCase();
}

/**
 * Auto-submit every in-progress attempt whose deadline (+grace) has passed.
 * Idempotent: the UPDATE is guarded by status = 'in_progress', so overlapping sweeps are safe.
 * Submitted-at is clamped to the deadline so late sweeps never grant extra time.
 */
export async function sweepExpiredAttempts(
  db: any, now: Date = new Date(), batch = 500,
  /** Called once per attempt this sweep actually transitioned (deterministic jobId makes it idempotent). */
  onSubmitted?: (a: { attemptId: string; instituteId: string }) => Promise<void>,
): Promise<number> {
  const cutoff = new Date(now.getTime() - SUBMIT_GRACE_MS);
  const rows = await db.select({ id: attempts.id, deadline: attempts.deadline, instituteId: attempts.instituteId }).from(attempts)
    .where(and(eq(attempts.status, "in_progress"), sql`${attempts.deadline} < ${cutoff}`)).limit(batch);
  let n = 0;
  for (const r of rows) {
    const res = await db.update(attempts)
      .set({ status: "auto_submitted", submittedAt: r.deadline, receiptCode: receiptCode(r.id, r.deadline) })
      .where(and(eq(attempts.id, r.id), eq(attempts.status, "in_progress"))).returning({ id: attempts.id });
    n += res.length;
    if (res.length && onSubmitted) await onSubmitted({ attemptId: r.id, instituteId: r.instituteId });
  }
  return n;
}

export async function startExamSweep(
  connection: ConnectionOptions, db: any,
  onSubmitted?: (a: { attemptId: string; instituteId: string }) => Promise<void>,
) {
  const queue = new Queue(EXAM_SWEEP_QUEUE, { connection });
  await queue.upsertJobScheduler("sweep", { every: SWEEP_EVERY_MS }, { name: "sweep", opts: { removeOnComplete: 20, removeOnFail: 100 } });
  const worker = new Worker(EXAM_SWEEP_QUEUE, async () => ({ submitted: await sweepExpiredAttempts(db, new Date(), 500, onSubmitted) }), { connection, concurrency: 1 });
  return { queue, worker };
}
