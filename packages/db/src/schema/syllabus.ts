import { pgTable, uuid, text, integer, timestamp, bigint, uniqueIndex, index } from 'drizzle-orm/pg-core';

// instituteId columns are plain uuids (no FK) so this file does not depend on the M1 tables.
// RLS policies on these tables are added by the core migration (instituteId = current_setting('app.institute_id')).

/** Exam -> Subject -> Unit -> Chapter -> Topic. instituteId NULL = global template. */
export const syllabusNodes = pgTable(
  'syllabus_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instituteId: uuid('institute_id'),
    parentId: uuid('parent_id'),
    level: text('level', { enum: ['exam', 'subject', 'unit', 'chapter', 'topic'] }).notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    /** Set on institute copies: the template node they were copied from. */
    templateNodeId: uuid('template_node_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('syllabus_nodes_parent_idx').on(t.parentId), index('syllabus_nodes_inst_idx').on(t.instituteId)],
);

export const syllabusMaterials = pgTable(
  'syllabus_materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instituteId: uuid('institute_id').notNull(),
    topicId: uuid('topic_id').notNull(),
    title: text('title').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('syllabus_materials_topic_idx').on(t.topicId)],
);

/** Per-batch progress; one row per (batch, topic). Batch A never touches Batch B. */
export const batchTopicProgress = pgTable(
  'batch_topic_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instituteId: uuid('institute_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    topicId: uuid('topic_id').notNull(),
    status: text('status', { enum: ['not_started', 'in_progress', 'completed'] }).notNull().default('not_started'),
    note: text('note'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('batch_topic_progress_uq').on(t.batchId, t.topicId)],
);
