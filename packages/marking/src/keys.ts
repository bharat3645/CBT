import type { MarkingRule, QuestionKey } from './types';

/** Structural mirror of @cbt/contracts QuestionPayload (only the fields marking needs). */
export interface PayloadLike {
  type: 'mcq_single' | 'mcq_multi' | 'numeric' | 'true_false' | 'subjective';
  marks?: number;
  negativeMarks?: number;
  topicIds?: string[];
  correct?: string[];
  numeric?: { answer: number; tolerance?: number; toleranceKind?: 'absolute' | 'percent'; alternates?: number[] };
}

/** Test-level scheme overrides (versioned together as `schemeVersion`). */
export interface SchemeOverride {
  correct?: number;
  /** may be given negative (NTA preset stores -1); magnitude is used */
  wrong?: number;
  partial?: MarkingRule['partial'];
}

/**
 * Convert a stored question payload to a marking key. Returns null for subjective questions
 * (those go through the teacher review workflow, not auto-evaluation).
 * `sectionId` identifies the test section the question sits in; `droppedIds` comes from key disputes.
 */
export function payloadToKey(
  questionId: string,
  sectionId: string,
  p: PayloadLike,
  scheme: SchemeOverride = {},
  dropped?: 'award_all' | 'void',
): QuestionKey | null {
  if (p.type === 'subjective') return null;
  const marking: MarkingRule = {
    correct: scheme.correct ?? p.marks ?? 1,
    wrong: Math.abs(scheme.wrong ?? p.negativeMarks ?? 0),
    ...(p.type === 'mcq_multi' && scheme.partial ? { partial: scheme.partial } : {}),
  };
  const base = { questionId, sectionId, topicId: p.topicIds?.[0] ?? null, marking, dropped };
  if (p.type === 'numeric') {
    const n = p.numeric;
    if (!n) throw new Error(`Question ${questionId}: numeric key missing`);
    const tol = !n.tolerance
      ? ({ mode: 'exact' } as const)
      : n.toleranceKind === 'percent'
        ? ({ mode: 'rel', value: n.tolerance / 100 } as const)
        : ({ mode: 'abs', value: n.tolerance } as const);
    return { ...base, type: 'numeric', numeric: { value: n.answer, alternates: n.alternates, tolerance: tol } };
  }
  return {
    ...base,
    type: p.type === 'mcq_multi' ? 'mcq_multi' : 'mcq_single',
    correctOptions: p.correct ?? [],
  };
}
