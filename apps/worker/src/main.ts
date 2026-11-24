import { Queue, type ConnectionOptions } from 'bullmq';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { createDb } from '@cbt/db';
import { users } from '@cbt/db/schema/_base';
import { loadEnv } from '@cbt/config';
import { QUEUES } from '@cbt/contracts/results';
import { createEvaluateWorker, enqueueEvaluate } from './processors/evaluate';
import { createRankWorker, enqueueRank } from './processors/rank';
import { createNotifyWorker, scheduleNotifySweep, releaseStuck } from './processors/notify';
import { createParsePaperWorker } from './processors/parse-paper';
import { startExamSweep } from './exam-sweep';
import { createSmtpNotifier } from './emails/smtp-notifier';
import { renderEmail } from './emails/templates';

async function main() {
  const env = loadEnv();
  // Owner connection: the worker crosses tenants (same as the API's DB_SYSTEM). Every job query filters by institute_id.
  const handle = createDb(env.DATABASE_URL);
  const db = handle.db as any;
  const connection: ConnectionOptions = { url: env.VALKEY_URL, maxRetriesPerRequest: null } as any;

  const evalQ = new Queue(QUEUES.evaluate, { connection });
  const rankQ = new Queue(QUEUES.rank, { connection });
  const notifyQ = new Queue(QUEUES.notify, { connection });

  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });
  const getObject = async (key: string) => {
    const r = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return r.Body!.transformToByteArray();
  };

  const workers = [
    createEvaluateWorker(connection, { db, enqueueRank: (j) => enqueueRank(rankQ, j) }),
    createRankWorker(connection, db),
    createNotifyWorker(connection, {
      db,
      notifiers: { email: createSmtpNotifier(env.SMTP_URL) },
      resolveContact: async (userId, channel) => {
        if (channel !== 'email') return null;
        const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
        return u?.email ?? null;
      },
      render: renderEmail,
    }),
    createParsePaperWorker(connection, { db, getObject, docparseUrl: process.env.DOCPARSE_URL ?? 'http://localhost:8000' }),
  ];

  // Auto-submitted attempts are evaluated too. EvaluateJob.reason has no 'auto' value, and the deterministic jobId
  // (eval-<attempt>-submit-0) is shared with the API submit path so the two can never double-evaluate.
  const sweep = await startExamSweep(connection, db, (a) => enqueueEvaluate(evalQ, { ...a, reason: 'submit' }));
  await releaseStuck(db);
  await scheduleNotifySweep(notifyQ);

  for (const w of workers) w.on('failed', (job, err) => console.error(`[${w.name}] job ${job?.id} failed: ${err.message}`));
  console.log(`worker up: ${[...workers.map((w) => w.name), sweep.worker.name].join(', ')}`);

  let closing = false;
  const shutdown = async (sig: string) => {
    if (closing) return;
    closing = true;
    console.log(`${sig}: shutting down`);
    try {
      await Promise.all([...workers, sweep.worker].map((w) => w.close()));
      await Promise.all([evalQ, rankQ, notifyQ, sweep.queue].map((q) => q.close()));
      s3.destroy();
      await handle.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => { console.error(e); process.exit(1); });
