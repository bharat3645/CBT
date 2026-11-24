import { Worker, type ConnectionOptions, type Queue } from 'bullmq';
import { and, eq, lte, or, sql } from 'drizzle-orm';
import { notifications, notificationPreferences } from '@cbt/db/schema/notifications';
import { backoffMs } from '@cbt/marking';
import { QUEUES, type NotifyJob } from '@cbt/contracts/results';

export const NOTIFY_QUEUE = QUEUES.notify;

/** Adapter rule: business code talks to Notifier, never to nodemailer/Novu/etc. directly. */
export interface Notifier {
  channel: 'email' | 'sms' | 'whatsapp';
  send(msg: { to: string; subject: string; html: string; text: string }): Promise<void>;
}

export interface NotifyDeps {
  db: any;
  notifiers: Partial<Record<'email' | 'sms' | 'whatsapp', Notifier>>;
  /** Contact address for a channel (email address, phone). null = cannot send -> skipped. */
  resolveContact: (userId: string, channel: 'email' | 'sms' | 'whatsapp') => Promise<string | null>;
  /** Render subject/html/text for a row. Default uses React Email via renderEmail (see emails/). */
  render: (n: { type: string; title: string; body: string; data: Record<string, unknown> }) => Promise<{ subject: string; html: string; text: string }>;
  now?: () => Date;
}

/** Atomically claim due rows so two workers never send the same notification. */
export async function claimDue(db: any, now: Date, limit = 50, instituteId?: string) {
  const due = await db.select({ id: notifications.id }).from(notifications)
    .where(and(
      eq(notifications.status, 'pending'), lte(notifications.nextAttemptAt, now),
      sql`${notifications.channel} <> 'in_app'`,
      instituteId ? eq(notifications.instituteId, instituteId) : undefined,
    )).limit(limit);
  const claimed: any[] = [];
  for (const d of due) {
    const [row] = await db.update(notifications).set({ status: 'sending', nextAttemptAt: now })
      .where(and(eq(notifications.id, d.id), eq(notifications.status, 'pending'))).returning();
    if (row) claimed.push(row);
  }
  return claimed;
}

async function optedOut(db: any, n: any): Promise<boolean> {
  const prefs = await db.select().from(notificationPreferences).where(and(
    eq(notificationPreferences.userId, n.userId), eq(notificationPreferences.channel, n.channel),
    or(eq(notificationPreferences.type, n.type), eq(notificationPreferences.type, '*')),
  ));
  // A specific-type preference beats the wildcard.
  const specific = prefs.find((p: any) => p.type === n.type);
  const effective = specific ?? prefs.find((p: any) => p.type === '*');
  return effective ? !effective.enabled : false;
}

/** Send one claimed row. Failure schedules a retry with exponential back-off until maxAttempts. */
export async function deliver(deps: NotifyDeps, n: any): Promise<'sent' | 'skipped' | 'retry' | 'failed'> {
  const { db } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const finish = (set: Record<string, unknown>) => db.update(notifications).set(set).where(eq(notifications.id, n.id));
  try {
    if (await optedOut(db, n)) { await finish({ status: 'skipped', lastError: 'opted out' }); return 'skipped'; }
    const notifier = deps.notifiers[n.channel as 'email'];
    if (!notifier) { await finish({ status: 'skipped', lastError: `no notifier for ${n.channel}` }); return 'skipped'; }
    const to = await deps.resolveContact(n.userId, n.channel);
    if (!to) { await finish({ status: 'skipped', lastError: 'no contact' }); return 'skipped'; }
    const msg = await deps.render({ type: n.type, title: n.title, body: n.body, data: n.data ?? {} });
    await notifier.send({ to, ...msg });
    await finish({ status: 'sent', sentAt: now, attempts: n.attempts + 1, lastError: null });
    return 'sent';
  } catch (err) {
    const attempts = n.attempts + 1;
    const message = err instanceof Error ? err.message : String(err);
    if (attempts >= n.maxAttempts) {
      await finish({ status: 'failed', attempts, lastError: message });
      return 'failed';
    }
    await finish({ status: 'pending', attempts, lastError: message, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)) });
    return 'retry';
  }
}

export async function processDue(deps: NotifyDeps, limit = 50) {
  const now = (deps.now ?? (() => new Date()))();
  const rows = await claimDue(deps.db, now, limit);
  const out = { sent: 0, skipped: 0, retry: 0, failed: 0 };
  for (const r of rows) out[await deliver(deps, r)]++;
  return out;
}

/** Recover rows stuck in 'sending' (worker crashed mid-send). Run on boot and every few minutes. */
export async function releaseStuck(db: any, olderThanMs = 10 * 60_000, now = new Date()) {
  await db.update(notifications).set({ status: 'pending' })
    .where(and(eq(notifications.status, 'sending'), lte(notifications.nextAttemptAt, new Date(now.getTime() - olderThanMs))));
}

export const NOTIFY_SWEEP_EVERY_MS = 15_000;

/** Repeatable sweep job drains the outbox; direct NotifyJob handles single rows enqueued by the API. */
export function createNotifyWorker(connection: ConnectionOptions, deps: NotifyDeps) {
  return new Worker<NotifyJob | Record<string, never>>(NOTIFY_QUEUE, async () => processDue(deps), { connection, concurrency: 2 });
}

export async function scheduleNotifySweep(queue: Queue) {
  await queue.add('sweep', {}, { repeat: { every: NOTIFY_SWEEP_EVERY_MS }, jobId: 'notify-sweep', removeOnComplete: 50, removeOnFail: 200 });
}
