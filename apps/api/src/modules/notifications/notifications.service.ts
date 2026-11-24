import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Channel, PreferenceInput } from '@cbt/contracts/results';
import { notifications, notificationPreferences } from '@cbt/db/schema/notifications';
import { RESULTS_DB, type Actor } from '../results/actor';

export interface NotifyInput {
  instituteId: string;
  userId: string;
  type: string;
  /** Stable per logical event, e.g. dedupeKey(['result_released', attemptId, version, channel]). Re-fires never double-send. */
  dedupeKey: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  channels?: Channel[];
}

/** Event entry point for every module (M8). The worker drains non-in-app rows; in-app rows are readable at once. */
@Injectable()
export class NotificationsService {
  constructor(@Inject(RESULTS_DB) private readonly db: any) {}

  async notify(n: NotifyInput): Promise<{ created: number }> {
    const channels = n.channels ?? ['in_app', 'email'];
    let created = 0;
    for (const channel of channels) {
      const rows = await this.db.insert(notifications).values({
        instituteId: n.instituteId, userId: n.userId, type: n.type, channel,
        dedupeKey: `${n.dedupeKey}:${channel}`, title: n.title, body: n.body ?? '', data: n.data ?? {},
        status: channel === 'in_app' ? 'sent' : 'pending',
        sentAt: channel === 'in_app' ? new Date() : null,
      }).onConflictDoNothing().returning({ id: notifications.id });
      created += rows.length;
    }
    return { created };
  }

  async list(actor: Actor, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const rows = await this.db.select().from(notifications).where(and(
      eq(notifications.userId, actor.id), eq(notifications.instituteId, actor.instituteId), eq(notifications.channel, 'in_app'),
      opts.unreadOnly ? isNull(notifications.readAt) : undefined,
    )).orderBy(desc(notifications.createdAt)).limit(Math.min(opts.limit ?? 30, 100));
    return rows.map((r: any) => ({
      id: r.id, type: r.type, title: r.title, body: r.body, data: r.data,
      readAt: r.readAt ? new Date(r.readAt).toISOString() : null, createdAt: new Date(r.createdAt).toISOString(),
    }));
  }

  async unreadCount(actor: Actor): Promise<{ count: number }> {
    const [r] = await this.db.select({ c: sql<number>`count(*)::int` }).from(notifications).where(and(
      eq(notifications.userId, actor.id), eq(notifications.instituteId, actor.instituteId),
      eq(notifications.channel, 'in_app'), isNull(notifications.readAt),
    ));
    return { count: r?.c ?? 0 };
  }

  async markRead(actor: Actor, id: string) {
    const rows = await this.db.update(notifications).set({ readAt: new Date() }).where(and(
      eq(notifications.id, id), eq(notifications.userId, actor.id), eq(notifications.instituteId, actor.instituteId),
      isNull(notifications.readAt),
    )).returning({ id: notifications.id });
    if (!rows.length) {
      const [exists] = await this.db.select({ id: notifications.id }).from(notifications)
        .where(and(eq(notifications.id, id), eq(notifications.userId, actor.id), eq(notifications.instituteId, actor.instituteId)));
      if (!exists) throw new NotFoundException();
    }
    return { ok: true };
  }

  async markAllRead(actor: Actor) {
    await this.db.update(notifications).set({ readAt: new Date() }).where(and(
      eq(notifications.userId, actor.id), eq(notifications.instituteId, actor.instituteId),
      eq(notifications.channel, 'in_app'), isNull(notifications.readAt),
    ));
    return { ok: true };
  }

  async getPreferences(actor: Actor) {
    return this.db.select({ type: notificationPreferences.type, channel: notificationPreferences.channel, enabled: notificationPreferences.enabled })
      .from(notificationPreferences).where(and(eq(notificationPreferences.userId, actor.id), eq(notificationPreferences.instituteId, actor.instituteId)));
  }

  async setPreferences(actor: Actor, input: PreferenceInput) {
    for (const p of input.preferences) {
      await this.db.insert(notificationPreferences).values({ instituteId: actor.instituteId, userId: actor.id, ...p })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId, notificationPreferences.type, notificationPreferences.channel],
          set: { enabled: p.enabled, updatedAt: new Date() },
        });
    }
    return { ok: true };
  }
}
