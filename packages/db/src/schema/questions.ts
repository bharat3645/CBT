import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, timestamp, jsonb, primaryKey, uniqueIndex, index } from 'drizzle-orm/pg-core';

/**
 * Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;  (put in the core migration, before this table)
 * RLS: instituteId = current_setting('app.institute_id')::uuid
 */
export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instituteId: uuid('institute_id').notNull(),
    /** Short human code shown in duplicate warnings, e.g. "Q12". */
    code: text('code').notNull(),
    type: text('type', { enum: ['mcq_single', 'mcq_multi', 'numeric', 'true_false', 'subjective'] }).notNull(),
    difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }).notNull().default('medium'),
    currentVersion: integer('current_version').notNull().default(1),
    /** Denormalised from the current version for search + pg_trgm similarity. */
    searchText: text('search_text').notNull().default(''),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('questions_code_uq').on(t.instituteId, t.code),
    index('questions_inst_idx').on(t.instituteId, t.type, t.difficulty),
    index('questions_search_trgm_idx').using('gin', sql`${t.searchText} gin_trgm_ops`),
  ],
);

/** Immutable: every edit inserts a new row. */
export const questionVersions = pgTable(
  'question_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instituteId: uuid('institute_id').notNull(),
    questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    payload: jsonb('payload').notNull(), // QuestionPayload (packages/contracts)
    changeNote: text('change_note'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('question_versions_uq').on(t.questionId, t.version)],
);

export const questionTopics = pgTable(
  'question_topics',
  {
    questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').notNull(),
    instituteId: uuid('institute_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.topicId] }), index('question_topics_topic_idx').on(t.topicId)],
);

