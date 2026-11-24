import { questions } from './questions';
import { pgTable, uuid, text, integer, real, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * M5 paper ingestion. RLS: institute_id = current_setting('app.institute_id')::uuid
 * `ingestion_papers` is mutable until approval; approval freezes it (status = 'approved').
 */
export const ingestionPapers = pgTable(
  'ingestion_papers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instituteId: uuid('institute_id').notNull(),
    title: text('title').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    /** Untouched original in object storage. */
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    scanStatus: text('scan_status', { enum: ['pending', 'clean', 'infected', 'error'] }).notNull().default('pending'),
    scanDetail: text('scan_detail'),
    status: text('status', { enum: ['uploaded', 'parsing', 'review', 'approved', 'failed', 'rejected'] })
      .notNull()
      .default('uploaded'),
    parseError: text('parse_error'),
    /** { "1": "B", ... } question number -> option label (or numeric value). */
    answerKey: jsonb('answer_key').$type<Record<string, string>>().notNull().default({}),
    /** Version of the review document; bumps on approval and freezes. */
    frozenVersion: integer('frozen_version'),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ingestion_papers_inst_idx').on(t.instituteId, t.status)],
);

export const ingestionDrafts = pgTable(
  'ingestion_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instituteId: uuid('institute_id').notNull(),
    paperId: uuid('paper_id').notNull().references(() => ingestionPapers.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    ordinal: integer('ordinal').notNull(),
    section: text('section'),
    type: text('type', { enum: ['mcq', 'assertion_reason', 'numeric'] }).notNull(),
    stem: text('stem').notNull(),
    options: jsonb('options').$type<{ label: string; text: string }[]>().notNull().default([]),
    answer: text('answer'),
    confidence: real('confidence').notNull(),
    label: text('label', { enum: ['EXTRACTED', 'AI-INFERRED', 'MANUAL'] }).notNull().default('EXTRACTED'),
    /** [{ code, message, severity, resolved }] ; any unresolved severity=error flag blocks approval. */
    flags: jsonb('flags')
      .$type<{ code: string; message: string; severity: 'error' | 'warning'; resolved: boolean }[]>()
      .notNull()
      .default([]),
    /** { page, bbox, blockStart, blockEnd } for the side-by-side original view. */
    source: jsonb('source').$type<{ page: number | null; bbox: number[] | null; blockStart: number; blockEnd: number }>().notNull(),
    /** Question-bank row created when the paper was approved (null until then). */
    questionId: uuid('question_id').references(() => questions.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ingestion_drafts_ord_uq').on(t.paperId, t.ordinal), index('ingestion_drafts_paper_idx').on(t.paperId)],
);
