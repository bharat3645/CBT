import { describe, expect, it } from 'vitest';
import { applyRevisions, backoffMs, dedupeKey, payloadToKey, evaluate, type PayloadLike } from './index';

const p: PayloadLike = { type: 'mcq_single', marks: 4, negativeMarks: 1, correct: ['A'], topicIds: ['t1'] };

describe('applyRevisions', () => {
  const revs = [
    { keyVersion: 2, questionId: 'q', change: { correct: ['B'] } },
    { keyVersion: 3, questionId: 'q', change: { dropped: 'award_all' as const } },
    { keyVersion: 2, questionId: 'other', change: { correct: ['C'] } },
  ];
  it('is reproducible at any key version', () => {
    expect(applyRevisions('q', p, revs, 1).payload.correct).toEqual(['A']);
    expect(applyRevisions('q', p, revs, 2).payload.correct).toEqual(['B']);
    expect(applyRevisions('q', p, revs, 2).dropped).toBeUndefined();
    expect(applyRevisions('q', p, revs, 3).dropped).toBe('award_all');
  });
  it('does not mutate the original payload', () => {
    applyRevisions('q', p, revs, 3);
    expect(p.correct).toEqual(['A']);
  });
  it('merges numeric changes', () => {
    const n: PayloadLike = { type: 'numeric', marks: 4, numeric: { answer: 1, tolerance: 0.1 } };
    const r = applyRevisions('q', n, [{ keyVersion: 2, questionId: 'q', change: { numeric: { answer: 2 } } }], 2);
    expect(r.payload.numeric).toEqual({ answer: 2, tolerance: 0.1 });
  });
});

describe('payloadToKey', () => {
  it('uses payload marks and negative marks', () => {
    expect(payloadToKey('q', 's', p)!.marking).toEqual({ correct: 4, wrong: 1 });
  });
  it('scheme override accepts negative wrong (NTA preset stores -1)', () => {
    expect(payloadToKey('q', 's', p, { correct: 4, wrong: -1 })!.marking.wrong).toBe(1);
  });
  it('percent tolerance becomes relative', () => {
    const k = payloadToKey('q', 's', { type: 'numeric', marks: 4, numeric: { answer: 100, tolerance: 5, toleranceKind: 'percent' } })!;
    expect(k.numeric!.tolerance).toEqual({ mode: 'rel', value: 0.05 });
  });
  it('zero tolerance is exact; subjective is skipped; true_false maps to single', () => {
    expect(payloadToKey('q', 's', { type: 'numeric', numeric: { answer: 1 } })!.numeric!.tolerance).toEqual({ mode: 'exact' });
    expect(payloadToKey('q', 's', { type: 'subjective' })).toBeNull();
    expect(payloadToKey('q', 's', { type: 'true_false', correct: ['true'] })!.type).toBe('mcq_single');
  });
  it('dropped award_all flows through to evaluation', () => {
    const k = payloadToKey('q', 's', p, {}, 'award_all')!;
    expect(evaluate({ attemptId: 'a', keyVersion: 1, schemeVersion: 1, questions: [k], answers: [] }).score).toBe(4);
  });
});

describe('notification helpers', () => {
  it('exponential back-off with cap', () => {
    expect([1, 2, 3, 4].map((n) => backoffMs(n))).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(backoffMs(20)).toBe(3_600_000);
  });
  it('dedupe key is deterministic (AT-25)', () => {
    expect(dedupeKey(['result_released', 'att1', 'email', 2])).toBe(dedupeKey(['result_released', 'att1', 'email', 2]));
  });
});
