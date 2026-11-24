import { z } from 'zod';

export const DRAFT_LABELS = ['EXTRACTED', 'AI-INFERRED', 'MANUAL'] as const;
export const draftLabelSchema = z.enum(DRAFT_LABELS);
export type DraftLabel = (typeof DRAFT_LABELS)[number];

export const PAPER_STATUSES = ['uploaded', 'parsing', 'review', 'approved', 'failed', 'rejected'] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export const draftFlagSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning']),
  resolved: z.boolean().default(false),
});
export type DraftFlag = z.infer<typeof draftFlagSchema>;

export const sourceRegionSchema = z.object({
  page: z.number().int().nullable(),
  bbox: z.array(z.number()).length(4).nullable(),
  blockStart: z.number().int(),
  blockEnd: z.number().int(),
});
export type SourceRegion = z.infer<typeof sourceRegionSchema>;

export const draftOptionSchema = z.object({ label: z.string().min(1).max(8), text: z.string() });

export const draftSchema = z.object({
  id: z.string().uuid(),
  paperId: z.string().uuid(),
  number: z.number().int(),
  ordinal: z.number().int(),
  section: z.string().nullable(),
  type: z.enum(['mcq', 'assertion_reason', 'numeric']),
  stem: z.string(),
  options: z.array(draftOptionSchema),
  answer: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  label: draftLabelSchema,
  flags: z.array(draftFlagSchema),
  source: sourceRegionSchema,
  /** Question-bank id once the paper is approved. */
  questionId: z.string().uuid().nullable().default(null),
});
export type Draft = z.infer<typeof draftSchema>;

/** Teacher edit of a draft. Any edit flips the label to MANUAL. */
export const updateDraftSchema = z
  .object({
    section: z.string().nullable(),
    type: z.enum(['mcq', 'assertion_reason', 'numeric']),
    stem: z.string().min(1),
    options: z.array(draftOptionSchema).max(8),
    answer: z.string().nullable(),
    /** codes of flags the teacher has resolved */
    resolveFlags: z.array(z.string()),
  })
  .partial();
export type UpdateDraft = z.infer<typeof updateDraftSchema>;

export const answerKeySchema = z.record(z.string().regex(/^\d+$/), z.string().min(1).max(32));
export const setAnswerKeySchema = z.object({
  /** either structured pairs or pasted text such as "1-A, 2-B" */
  key: answerKeySchema.optional(),
  text: z.string().max(20000).optional(),
});
export type SetAnswerKey = z.infer<typeof setAnswerKeySchema>;

export const paperSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  filename: z.string(),
  status: z.enum(PAPER_STATUSES),
  scanStatus: z.enum(['pending', 'clean', 'infected', 'error']),
  parseError: z.string().nullable(),
  questionCount: z.number().int(),
  openFlagCount: z.number().int(),
  missingKeyCount: z.number().int(),
  createdAt: z.string(),
});
export type PaperSummary = z.infer<typeof paperSummarySchema>;

export const paperDetailSchema = paperSummarySchema.extend({
  answerKey: answerKeySchema,
  drafts: z.array(draftSchema),
  originalUrl: z.string().nullable(),
  /** Question-bank ids in draft order; empty until approved. */
  questionIds: z.array(z.string().uuid()),
});
export type PaperDetail = z.infer<typeof paperDetailSchema>;

/** Body of the 422 returned when approval is blocked. */
export const approvalBlockedSchema = z.object({
  statusCode: z.literal(422),
  message: z.string(),
  openFlags: z.array(z.object({ draftId: z.string(), number: z.number(), codes: z.array(z.string()) })),
  missingKey: z.array(z.number().int()),
});
export type ApprovalBlocked = z.infer<typeof approvalBlockedSchema>;

/** Job payload enqueued for the worker, which calls docparse and stores drafts. */
export const parsePaperJobSchema = z.object({ paperId: z.string().uuid(), instituteId: z.string().uuid() });
export type ParsePaperJob = z.infer<typeof parsePaperJobSchema>;

/** Shape of POST /parse from services/docparse (camelCase). */
export const docparseResultSchema = z.object({
  filename: z.string(),
  sections: z.array(z.string()),
  answerKey: z.record(z.string()),
  aiPassApplied: z.boolean(),
  questions: z.array(
    z.object({
      number: z.number().int(),
      section: z.string().nullable(),
      type: z.enum(['mcq', 'assertion_reason', 'numeric']),
      stem: z.string(),
      options: z.array(z.object({ label: z.string(), text: z.string() }).passthrough()),
      answer: z.string().nullable(),
      confidence: z.number(),
      label: draftLabelSchema,
      flags: z.array(z.object({ code: z.string(), message: z.string(), severity: z.enum(['error', 'warning']) })),
      source: sourceRegionSchema,
    }),
  ),
});
export type DocparseResult = z.infer<typeof docparseResultSchema>;
