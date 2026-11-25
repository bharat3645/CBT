import { z } from 'zod';

export const QUESTION_TYPES = ['mcq_single', 'mcq_multi', 'numeric', 'true_false', 'subjective'] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const difficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Tiptap / ProseMirror JSON document. Math is stored as `inlineMath`/`blockMath` nodes with `attrs.latex`. */
export interface RichDoc {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  content?: RichDoc[];
}
export const richDocSchema: z.ZodType<RichDoc> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.unknown()).optional(),
    text: z.string().optional(),
    content: z.array(richDocSchema).optional(),
  }),
);

export const optionSchema = z.object({
  id: z.string().min(1).max(8), // "A", "B", ...
  content: richDocSchema,
});
export type QuestionOption = z.infer<typeof optionSchema>;

/** Authoring metadata shown in the question editor (all optional; kept with the version payload). */
export const questionMetaSchema = z.object({
  grade: z.string().max(100).optional(),
  source: z.string().max(300).optional(),
  author: z.string().max(200).optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  learningOutcomes: z.string().max(2000).optional(),
});
export type QuestionMeta = z.infer<typeof questionMetaSchema>;

const base = {
  meta: questionMetaSchema.optional(),
  stem: richDocSchema,
  explanation: richDocSchema.optional(),
  difficulty: difficultySchema.default('medium'),
  marks: z.number().positive().default(4),
  negativeMarks: z.number().min(0).default(0),
  topicIds: z.array(z.string().uuid()).default([]),
};

const optionsArr = z
  .array(optionSchema)
  .min(2)
  .max(8)
  .refine((o) => new Set(o.map((x) => x.id)).size === o.length, 'Option ids must be unique');

/** Question payload per type (discriminated on `type`). */
export const questionPayloadSchema = z
  .discriminatedUnion('type', [
    z.object({ ...base, type: z.literal('mcq_single'), options: optionsArr, correct: z.array(z.string()).length(1) }),
    z.object({ ...base, type: z.literal('mcq_multi'), options: optionsArr, correct: z.array(z.string()).min(1) }),
    z.object({ ...base, type: z.literal('true_false'), correct: z.array(z.enum(['true', 'false'])).length(1) }),
    z.object({
      ...base,
      type: z.literal('numeric'),
      numeric: z.object({
        answer: z.number(),
        tolerance: z.number().min(0).default(0),
        toleranceKind: z.enum(['absolute', 'percent']).default('absolute'),
      }),
    }),
    z.object({ ...base, type: z.literal('subjective'), modelAnswer: richDocSchema.optional() }),
  ])
  .superRefine((q, ctx) => {
    if (q.type === 'mcq_single' || q.type === 'mcq_multi') {
      const ids = new Set(q.options.map((o) => o.id));
      for (const c of q.correct) {
        if (!ids.has(c)) ctx.addIssue({ code: 'custom', path: ['correct'], message: `Unknown option ${c}` });
      }
    }
  });
export type QuestionPayload = z.infer<typeof questionPayloadSchema>;

export const createQuestionSchema = z.object({
  payload: questionPayloadSchema,
  /** Duplicate warnings never block; this records that the author saw them. */
  acknowledgeDuplicates: z.boolean().default(false),
});
export const updateQuestionSchema = z.object({
  payload: questionPayloadSchema,
  changeNote: z.string().max(500).optional(),
});

export const questionVersionSchema = z.object({
  id: z.string().uuid(),
  questionId: z.string().uuid(),
  version: z.number().int().positive(),
  payload: questionPayloadSchema,
  changeNote: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type QuestionVersion = z.infer<typeof questionVersionSchema>;

export const duplicateCandidateSchema = z.object({
  questionId: z.string().uuid(),
  label: z.string(), // e.g. "Q12"
  similarity: z.number().min(0).max(1),
  snippet: z.string(),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const duplicateCheckSchema = z.object({
  stemText: z.string().min(1),
  excludeQuestionId: z.string().uuid().optional(),
});

export const questionSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  type: questionTypeSchema,
  difficulty: difficultySchema,
  snippet: z.string(),
  topicIds: z.array(z.string().uuid()),
  currentVersion: z.number().int(),
  updatedAt: z.string().datetime(),
});
export type QuestionSummary = z.infer<typeof questionSummarySchema>;

export const searchQuestionsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  examId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  difficulty: difficultySchema.optional(),
  type: questionTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type SearchQuestions = z.infer<typeof searchQuestionsSchema>;

export const DUPLICATE_THRESHOLD = 0.6;

/** Flatten a rich doc to plain text (LaTeX kept inline) for search and similarity. */
export function richDocToText(doc: RichDoc | undefined): string {
  if (!doc) return '';
  if (doc.type === 'inlineMath' || doc.type === 'blockMath') return String(doc.attrs?.latex ?? '');
  if (doc.text) return doc.text;
  return (doc.content ?? []).map(richDocToText).join(doc.type === 'doc' ? ' ' : '').trim();
}
