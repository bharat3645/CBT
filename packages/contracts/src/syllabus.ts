import { z } from 'zod';

/** Exam -> Subject -> Unit -> Chapter -> Topic (FR-060). */
export const SYLLABUS_LEVELS = ['exam', 'subject', 'unit', 'chapter', 'topic'] as const;
export const syllabusLevelSchema = z.enum(SYLLABUS_LEVELS);
export type SyllabusLevel = (typeof SYLLABUS_LEVELS)[number];

export const childLevel = (level: SyllabusLevel): SyllabusLevel | null =>
  SYLLABUS_LEVELS[SYLLABUS_LEVELS.indexOf(level) + 1] ?? null;

export const createSyllabusNodeSchema = z.object({
  parentId: z.string().uuid().nullable().default(null),
  level: syllabusLevelSchema,
  name: z.string().trim().min(1).max(200),
  position: z.number().int().min(0).default(0),
});
export type CreateSyllabusNode = z.infer<typeof createSyllabusNodeSchema>;

export const updateSyllabusNodeSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  position: z.number().int().min(0).optional(),
});

export const syllabusNodeSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  level: syllabusLevelSchema,
  name: z.string(),
  position: z.number().int(),
});
export type SyllabusNode = z.infer<typeof syllabusNodeSchema>;
export type SyllabusTreeNode = SyllabusNode & { children: SyllabusTreeNode[] };

export const copyTemplateSchema = z.object({ templateRootId: z.string().uuid() });

export const materialSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  title: z.string(),
  storageKey: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});
export const createMaterialSchema = z.object({
  topicId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

export const PROGRESS_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export const progressStatusSchema = z.enum(PROGRESS_STATUSES);
export const setTopicProgressSchema = z.object({
  status: progressStatusSchema,
  note: z.string().max(1000).optional(),
});
export type SetTopicProgress = z.infer<typeof setTopicProgressSchema>;

export const topicProgressSchema = z.object({
  batchId: z.string().uuid(),
  topicId: z.string().uuid(),
  status: progressStatusSchema,
  completedAt: z.string().datetime().nullable(),
});
export type TopicProgress = z.infer<typeof topicProgressSchema>;
