import { questionPayloadSchema, richDocToText, type QuestionMeta, type QuestionPayload, type QuestionType, type RichDoc } from '@cbt/contracts';

export const emptyDoc = (): RichDoc => ({ type: 'doc', content: [{ type: 'paragraph' }] });

export const OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** Editor working state; converted to a strict QuestionPayload on save. */
export interface QuestionDraft {
  type: QuestionType;
  stem: RichDoc;
  explanation: RichDoc;
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  negativeMarks: number;
  topicIds: string[];
  options: Array<{ id: string; content: RichDoc }>;
  correct: string[];
  numeric: { answer: number | null; tolerance: number; toleranceKind: 'absolute' | 'percent' };
  grade: string;
  source: string;
  author: string;
  tags: string[];
  learningOutcomes: string;
}

export function emptyDraft(type: QuestionType = 'mcq_single'): QuestionDraft {
  return {
    type,
    stem: emptyDoc(),
    explanation: emptyDoc(),
    difficulty: 'medium',
    marks: 4,
    negativeMarks: type === 'subjective' ? 0 : 1,
    topicIds: [],
    options: OPTION_IDS.slice(0, 4).map((id) => ({ id, content: emptyDoc() })),
    correct: [],
    numeric: { answer: null, tolerance: 0, toleranceKind: 'absolute' },
    grade: '',
    source: '',
    author: '',
    tags: [],
    learningOutcomes: '',
  };
}

export function changeType(d: QuestionDraft, type: QuestionType): QuestionDraft {
  const correct = type === 'mcq_single' ? d.correct.slice(0, 1) : type === 'true_false' ? [] : d.correct;
  return { ...d, type, correct };
}

export function toggleCorrect(d: QuestionDraft, id: string): QuestionDraft {
  if (d.type === 'mcq_multi') {
    return { ...d, correct: d.correct.includes(id) ? d.correct.filter((c) => c !== id) : [...d.correct, id] };
  }
  return { ...d, correct: [id] };
}

export function addOption(d: QuestionDraft): QuestionDraft {
  const next = OPTION_IDS.find((id) => !d.options.some((o) => o.id === id));
  return next ? { ...d, options: [...d.options, { id: next, content: emptyDoc() }] } : d;
}

/** Removes an option and drops it from the correct set. Ids are kept stable (no relabelling). */
export function removeOption(d: QuestionDraft, id: string): QuestionDraft {
  if (d.options.length <= 2) return d;
  return { ...d, options: d.options.filter((o) => o.id !== id), correct: d.correct.filter((c) => c !== id) };
}

function draftMeta(d: QuestionDraft): QuestionMeta | undefined {
  const meta: QuestionMeta = {};
  if (d.grade.trim()) meta.grade = d.grade.trim();
  if (d.source.trim()) meta.source = d.source.trim();
  if (d.author.trim()) meta.author = d.author.trim();
  if (d.tags.length) meta.tags = d.tags;
  if (d.learningOutcomes.trim()) meta.learningOutcomes = d.learningOutcomes.trim();
  return Object.keys(meta).length ? meta : undefined;
}

export function draftToPayload(d: QuestionDraft): unknown {
  const base = {
    meta: draftMeta(d),
    type: d.type,
    stem: d.stem,
    explanation: richDocToText(d.explanation) ? d.explanation : undefined,
    difficulty: d.difficulty,
    marks: d.marks,
    negativeMarks: d.negativeMarks,
    topicIds: d.topicIds,
  };
  switch (d.type) {
    case 'mcq_single':
    case 'mcq_multi':
      return { ...base, options: d.options, correct: d.correct };
    case 'true_false':
      return { ...base, correct: d.correct };
    case 'numeric':
      return { ...base, numeric: { ...d.numeric, answer: d.numeric.answer ?? Number.NaN } };
    case 'subjective':
      return base;
  }
}

export type DraftResult = { ok: true; payload: QuestionPayload } | { ok: false; errors: string[] };

export function validateDraft(d: QuestionDraft): DraftResult {
  const errors: string[] = [];
  if (!richDocToText(d.stem)) errors.push('Question text is required');
  if ((d.type === 'mcq_single' || d.type === 'mcq_multi') && d.options.some((o) => !richDocToText(o.content)))
    errors.push('Every option needs text');
  if ((d.type === 'mcq_single' || d.type === 'mcq_multi' || d.type === 'true_false') && d.correct.length === 0)
    errors.push('Mark the correct answer');
  if (d.type === 'numeric' && (d.numeric.answer === null || Number.isNaN(d.numeric.answer)))
    errors.push('Enter the numeric answer');
  if (errors.length) return { ok: false, errors };
  const parsed = questionPayloadSchema.safeParse(draftToPayload(d));
  return parsed.success ? { ok: true, payload: parsed.data } : { ok: false, errors: parsed.error.issues.map((i) => i.message) };
}

/** Hydrate the editor from a stored payload. */
export function payloadToDraft(p: QuestionPayload): QuestionDraft {
  const d = emptyDraft(p.type);
  return {
    ...d,
    stem: p.stem,
    explanation: p.explanation ?? emptyDoc(),
    difficulty: p.difficulty,
    marks: p.marks,
    negativeMarks: p.negativeMarks,
    topicIds: p.topicIds,
    options: 'options' in p ? p.options : d.options,
    correct: 'correct' in p ? p.correct : [],
    numeric: p.type === 'numeric' ? p.numeric : d.numeric,
    grade: p.meta?.grade ?? '',
    source: p.meta?.source ?? '',
    author: p.meta?.author ?? '',
    tags: p.meta?.tags ?? [],
    learningOutcomes: p.meta?.learningOutcomes ?? '',
  };
}
