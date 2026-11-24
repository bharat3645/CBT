import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

/**
 * M8 outbox. One row per (user, channel, event). dedupe_key is unique so a re-fired event can never send twice (AT-25).
 * In-app rows are readable immediately (read_at); email rows are picked up by the notify worker.
 */
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  instituteId: text('institute_id').notNull(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // result_released | test_scheduled | attendance_alert | ...
  channel: text('channel', { enum: ['in_app', 'email', 'sms', 'whatsapp'] }).notNull(),
  dedupeKey: text('dedupe_key').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
  status: text('status', { enum: ['pending', 'sending', 'sent', 'failed', 'skipped'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  lastError: text('last_error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('notifications_dedupe_uq').on(t.instituteId, t.dedupeKey),
  index('notifications_user_idx').on(t.userId, t.channel, t.readAt),
  index('notifications_due_idx').on(t.status, t.nextAttemptAt),
]);

/** Preferences: absent row = default (in_app + email on). Mandatory types ignore opt-out. */
export const notificationPreferences = pgTable('notification_preferences', {
  instituteId: text('institute_id').notNull(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // '*' = all types
  channel: text('channel', { enum: ['in_app', 'email', 'sms', 'whatsapp'] }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('notification_prefs_uq').on(t.userId, t.type, t.channel)]);
