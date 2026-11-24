import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Tenant column `institute_id` on every table (RLS policies live in migrations owned by core).
export const examPresets = pgTable("exam_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  instituteId: text("institute_id"), // null = system preset
  key: text("key").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ keyIdx: uniqueIndex("exam_presets_inst_key").on(t.instituteId, t.key) }));

export const tests = pgTable("tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  instituteId: text("institute_id").notNull(),
  paperId: uuid("paper_id").notNull(),
  title: text("title").notNull(),
  presetKey: text("preset_key").notNull(),
  config: jsonb("config").notNull(), // resolved preset + overrides, frozen at publish
  sections: jsonb("sections").notNull(), // [{name, questionIds, durationMinutes?}]
  batchIds: jsonb("batch_ids").notNull().default(sql`'[]'::jsonb`),
  durationMinutes: integer("duration_minutes").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  instructions: text("instructions"),
  status: text("status").notNull().default("draft"), // draft | published | closed
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ instIdx: index("tests_inst_idx").on(t.instituteId, t.status) }));

export const attempts = pgTable("attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  instituteId: text("institute_id").notNull(),
  testId: uuid("test_id").notNull(),
  studentId: text("student_id").notNull(),
  status: text("status").notNull().default("in_progress"), // in_progress|submitted|auto_submitted|flagged
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(), // server-authoritative
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  receiptCode: text("receipt_code"),
  incidentCount: integer("incident_count").notNull().default(0),
  flagged: boolean("flagged").notNull().default(false),
}, (t) => ({
  oneAttempt: uniqueIndex("attempts_test_student").on(t.testId, t.studentId),
  sweepIdx: index("attempts_sweep_idx").on(t.status, t.deadline),
}));

export const attemptAnswers = pgTable("attempt_answers", {
  attemptId: uuid("attempt_id").notNull(),
  questionId: uuid("question_id").notNull(),
  instituteId: text("institute_id").notNull(),
  seq: integer("seq").notNull(),
  status: text("status").notNull(),
  value: jsonb("value").notNull(),
  timeSpentMs: integer("time_spent_ms").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: uniqueIndex("attempt_answers_pk").on(t.attemptId, t.questionId) }));

export const attemptIncidents = pgTable("attempt_incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id").notNull(),
  instituteId: text("institute_id").notNull(),
  type: text("type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  durationMs: integer("duration_ms"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ attIdx: index("attempt_incidents_attempt").on(t.attemptId) }));
