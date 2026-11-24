import type {
  Answer, EvaluateInput, Evaluation, EvaluationItem, ItemResult, NumericTolerance, QuestionKey, SectionScore,
} from './types';

/** Remove float noise (0.1+0.2). Marks are kept to 4 dp. */
export const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 1e4) / 1e4 || 0; // || 0 normalises -0

function parseNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = raw.trim().replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function numericMatches(given: number, expected: number, tol: NumericTolerance): boolean {
  switch (tol.mode) {
    case 'exact': return given === expected;
    case 'abs': return Math.abs(given - expected) <= tol.value + 1e-12;
    case 'rel': return Math.abs(given - expected) <= Math.abs(expected) * tol.value + 1e-12;
  }
}

function isAnswered(q: QuestionKey, a: Answer | undefined): boolean {
  if (!a) return false;
  if (q.type === 'numeric') return parseNumber(a.numeric) !== null;
  return (a.selected?.length ?? 0) > 0;
}

/** Max marks for a question: full marks of the correct answer. */
export const maxMarksOf = (q: QuestionKey): number => q.marking.correct;

export function markQuestion(q: QuestionKey, a: Answer | undefined): { result: ItemResult; marks: number } {
  const r = markRaw(q, a);
  return { result: r.result, marks: r.marks || 0 }; // normalise -0
}

function markRaw(q: QuestionKey, a: Answer | undefined): { result: ItemResult; marks: number } {
  const max = maxMarksOf(q);
  if (q.dropped === 'void') return { result: 'void', marks: 0 };
  if (q.dropped === 'award_all') return { result: 'correct', marks: max };
  if (!isAnswered(q, a)) return { result: 'unanswered', marks: 0 };
  const { correct: m, wrong: n } = q.marking;

  if (q.type === 'numeric') {
    const given = parseNumber(a!.numeric)!;
    const num = q.numeric;
    if (!num) throw new Error(`Question ${q.questionId}: numeric key missing`);
    const ok = [num.value, ...(num.alternates ?? [])].some((e) => numericMatches(given, e, num.tolerance));
    return ok ? { result: 'correct', marks: m } : { result: 'incorrect', marks: -n };
  }

  const key = new Set(q.correctOptions ?? []);
  if (key.size === 0) throw new Error(`Question ${q.questionId}: correctOptions missing`);
  const sel = new Set(a!.selected);

  if (q.type === 'mcq_single') {
    const ok = sel.size === 1 && key.has([...sel][0]!);
    return ok ? { result: 'correct', marks: m } : { result: 'incorrect', marks: -n };
  }

  // mcq_multi
  let right = 0;
  let bad = 0;
  for (const s of sel) {
    if (key.has(s)) right++;
    else bad++;
  }
  if (bad === 0 && right === key.size) return { result: 'correct', marks: m };
  const p = q.marking.partial;
  if (bad > 0) {
    const penalty = p ? (p.onWrongOption === 'negative' ? n : 0) : n;
    return { result: 'incorrect', marks: -penalty };
  }
  // some correct, none wrong
  if (p && p.mode === 'per_correct_option' && right > 0) {
    return { result: 'partial', marks: Math.min(round4(right * p.perCorrect), m) };
  }
  return { result: 'incorrect', marks: -n };
}

export function evaluate(input: EvaluateInput): Evaluation {
  const byQ = new Map<string, Answer>();
  for (const a of input.answers) byQ.set(a.questionId, a); // last write wins

  const items: EvaluationItem[] = [];
  const sections = new Map<string, SectionScore>();
  const tot = { correct: 0, incorrect: 0, partial: 0, unanswered: 0 };
  let score = 0, maxScore = 0, time = 0;

  for (const q of input.questions) {
    const a = byQ.get(q.questionId);
    const { result, marks } = markQuestion(q, a);
    const max = result === 'void' ? 0 : maxMarksOf(q);
    const t = a?.timeSpentSec ?? 0;
    items.push({
      questionId: q.questionId, sectionId: q.sectionId, topicId: q.topicId ?? null,
      result, marks: round4(marks), maxMarks: max, timeSpentSec: t,
    });
    let s = sections.get(q.sectionId);
    if (!s) {
      s = { sectionId: q.sectionId, score: 0, maxScore: 0, correct: 0, incorrect: 0, partial: 0, unanswered: 0 };
      sections.set(q.sectionId, s);
    }
    s.score = round4(s.score + marks);
    s.maxScore += max;
    score += marks; maxScore += max; time += t;
    if (result !== 'void') {
      tot[result]++;
      s[result]++;
    }
  }
  const attempted = tot.correct + tot.incorrect + tot.partial;
  return {
    attemptId: input.attemptId,
    version: input.version ?? 1,
    keyVersion: input.keyVersion,
    schemeVersion: input.schemeVersion,
    score: round4(score), maxScore,
    ...tot, attempted,
    accuracy: attempted === 0 ? 0 : round4((tot.correct / attempted) * 100),
    timeSpentSec: time,
    sections: [...sections.values()],
    items,
  };
}

export interface ReevaluationDiff {
  scoreBefore: number;
  scoreAfter: number;
  changedQuestions: { questionId: string; before: number; after: number }[];
}

/**
 * Re-evaluate after an answer-key dispute. Returns a NEW evaluation with version = prev.version + 1.
 * The caller persists it as a new row and keeps the previous one (immutability, FR-056 / AT-13).
 */
export function reevaluate(
  prev: Evaluation, input: Omit<EvaluateInput, 'version' | 'attemptId'>,
): { next: Evaluation; diff: ReevaluationDiff } {
  const next = evaluate({ ...input, attemptId: prev.attemptId, version: prev.version + 1 });
  const before = new Map(prev.items.map((i) => [i.questionId, i.marks]));
  const changedQuestions = next.items
    .filter((i) => (before.get(i.questionId) ?? 0) !== i.marks)
    .map((i) => ({ questionId: i.questionId, before: before.get(i.questionId) ?? 0, after: i.marks }));
  return { next, diff: { scoreBefore: prev.score, scoreAfter: next.score, changedQuestions } };
}
