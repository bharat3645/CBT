import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, integer, numeric, boolean, timestamp, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

// M7 evaluation / ranks. institute_id is text to match attempts/tests. No cross-file FKs (ownership boundaries);
// RLS (institute_id = current_setting('app.institute_id')) is added by the core migration.

/** Per-test result policy: release timing, tie-breakers, key/scheme versions currently in force. */
export const resultSettings = pgTable('result_settings', {
  testId: uuid('test_id').primaryKey(),
  instituteId: text('institute_id').notNull(),
  releaseMode: text('release_mode', { enum: ['immediate', 'scheduled', 'manual'] }).notNull().default('immediate'),
  releaseAt: timestamp('release_at', { withTimezone: true }),
  tieBreakers: jsonb('tie_breakers').notNull().default(sql`'[]'::jsonb`), // TieBreaker[]
  minPercentileParticipants: integer('min_percentile_participants').notNull().default(30),
  keyVersion: integer('key_version').notNull().default(1),
  schemeVersion: integer('scheme_version').notNull().default(1),
  /** Partial-marking config for multi-correct questions (MarkingRule['partial']). */
  partial: jsonb('partial'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Immutable history of answer-key corrections (FR-056). Each row bumps the test's key_version. */
export const answerKeyRevisions = pgTable('answer_key_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  instituteId: text('institute_id').notNull(),
  testId: uuid('test_id').notNull(),
  keyVersion: integer('key_version').notNull(),
  questionId: uuid('question_id').notNull(),
  /** { correct?: string[]; numeric?: {...}; dropped?: 'award_all' | 'void' } */
  change: jsonb('change').notNull(),
  reason: text('reason'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('answer_key_rev_uq').on(t.testId, t.keyVersion, t.questionId)]);

/** One row per (attempt, version). Never updated after insert except is_current / released_at. */
export const evaluations = pgTable('evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  instituteId: text('institute_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  testId: uuid('test_id').notNull(),
  studentId: text('student_id').notNull(),
  batchId: uuid('batch_id'),
  attemptNo: integer('attempt_no').notNull().default(1),
  version: integer('version').notNull(),
  keyVersion: integer('key_version').notNull(),
  schemeVersion: integer('scheme_version').notNull(),
  score: numeric('score', { precision: 10, scale: 4, mode: 'number' }).notNull(),
  maxScore: numeric('max_score', { precision: 10, scale: 4, mode: 'number' }).notNull(),
  correct: integer('correct').notNull(),
  incorrect: integer('incorrect').notNull(),
  partial: integer('partial').notNull().default(0),
  unanswered: integer('unanswered').notNull(),
  accuracy: numeric('accuracy', { precision: 6, scale: 2, mode: 'number' }).notNull(),
  timeSpentSec: integer('time_spent_sec').notNull().default(0),
  sections: jsonb('sections').notNull(), // SectionScore[]
  isCurrent: boolean('is_current').notNull().default(true),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('evaluations_attempt_version_uq').on(t.attemptId, t.version),
  uniqueIndex('evaluations_current_uq').on(t.attemptId).where(sql`${t.isCurrent}`),
  index('evaluations_test_idx').on(t.testId, t.isCurrent),
  index('evaluations_student_idx').on(t.studentId, t.evaluatedAt),
  index('evaluations_batch_idx').on(t.batchId, t.testId),
]);

/** Per-question marks. Denormalises topic/section so analytics never joins other modules. */
export const evaluationItems = pgTable('evaluation_items', {
  evaluationId: uuid('evaluation_id').notNull().references(() => evaluations.id, { onDelete: 'cascade' }),
  instituteId: text('institute_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  questionId: uuid('question_id').notNull(),
  sectionId: text('section_id').notNull(),
  topicId: uuid('topic_id'),
  result: text('result', { enum: ['correct', 'incorrect', 'partial', 'unanswered', 'void'] }).notNull(),
  marks: numeric('marks', { precision: 8, scale: 4, mode: 'number' }).notNull(),
  maxMarks: numeric('max_marks', { precision: 8, scale: 4, mode: 'number' }).notNull(),
  timeSpentSec: integer('time_spent_sec').notNull().default(0),
}, (t) => [
  uniqueIndex('evaluation_items_uq').on(t.evaluationId, t.questionId),
  index('evaluation_items_topic_idx').on(t.instituteId, t.topicId),
]);

/** Recomputed wholesale per test by the rank job (delete + insert in one tx). */
export const rankings = pgTable('rankings', {
  id: uuid('id').primaryKey().defaultRandom(),
  instituteId: text('institute_id').notNull(),
  testId: uuid('test_id').notNull(),
  scope: text('scope', { enum: ['test', 'batch', 'institute'] }).notNull(),
  scopeId: text('scope_id'),
  attemptId: uuid('attempt_id').notNull(),
  studentId: text('student_id').notNull(),
  rank: integer('rank').notNull(),
  percentile: numeric('percentile', { precision: 5, scale: 2, mode: 'number' }),
  participants: integer('participants').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('rankings_test_scope_idx').on(t.testId, t.scope, t.rank),
  index('rankings_student_idx').on(t.studentId, t.testId),
]);

/** Generated PDF report cache (storage key per evaluation version). */
export const resultReports = pgTable('result_reports', {
  evaluationId: uuid('evaluation_id').primaryKey().references(() => evaluations.id, { onDelete: 'cascade' }),
  instituteId: text('institute_id').notNull(),
  storageKey: text('storage_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
