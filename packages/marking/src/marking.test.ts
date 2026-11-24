import { describe, expect, it } from 'vitest';
import {
  evaluate, reevaluate, markQuestion, numericMatches, computeRanks, computeAllScopes,
  recommend, reteachList, isDeclining, median, distribution,
  type QuestionKey, type RankEntry,
} from './index';

const mk = (over: Partial<QuestionKey> & Pick<QuestionKey, 'questionId'>): QuestionKey => ({
  type: 'mcq_single', sectionId: 'S1', topicId: 'T1', correctOptions: ['A'],
  marking: { correct: 4, wrong: 1 }, ...over,
});

/** AT-12: correct, wrong (-1), skipped, partial multi-correct, numeric tolerance. Hand-calculated. */
describe('AT-12 evaluation test set', () => {
  const questions: QuestionKey[] = [
    mk({ questionId: 'q1' }), // correct  +4
    mk({ questionId: 'q2' }), // wrong    -1
    mk({ questionId: 'q3' }), // skipped   0
    mk({
      questionId: 'q4', type: 'mcq_multi', correctOptions: ['A', 'B', 'C'],
      marking: { correct: 4, wrong: 2, partial: { mode: 'per_correct_option', perCorrect: 1, onWrongOption: 'negative' } },
    }), // picks A,B -> +2
    mk({
      questionId: 'q5', type: 'numeric', correctOptions: undefined,
      numeric: { value: 3.14, tolerance: { mode: 'abs', value: 0.01 } },
    }), // 3.145 -> +4
    mk({ questionId: 'q6', sectionId: 'S2', topicId: 'T2' }), // wrong -1
  ];
  const answers = [
    { questionId: 'q1', selected: ['A'], timeSpentSec: 30 },
    { questionId: 'q2', selected: ['B'], timeSpentSec: 20 },
    { questionId: 'q4', selected: ['A', 'B'], timeSpentSec: 60 },
    { questionId: 'q5', numeric: '3.145', timeSpentSec: 90 },
    { questionId: 'q6', selected: ['D'] },
  ];
  const ev = evaluate({ attemptId: 'a1', keyVersion: 3, schemeVersion: 2, questions, answers });

  it('computes score = 4 -1 +2 +4 -1 = 8 of 24', () => {
    expect(ev.score).toBe(8);
    expect(ev.maxScore).toBe(24);
  });
  it('counts outcomes and accuracy = correct/attempted', () => {
    expect(ev).toMatchObject({ correct: 2, incorrect: 2, partial: 1, unanswered: 1, attempted: 5 });
    expect(ev.accuracy).toBe(40);
  });
  it('stamps key and scheme version', () => {
    expect(ev.keyVersion).toBe(3);
    expect(ev.schemeVersion).toBe(2);
    expect(ev.version).toBe(1);
  });
  it('gives section-wise scores', () => {
    const s1 = ev.sections.find((s) => s.sectionId === 'S1')!;
    const s2 = ev.sections.find((s) => s.sectionId === 'S2')!;
    expect(s1.score).toBe(9);
    expect(s2.score).toBe(-1);
    expect(s1.score + s2.score).toBe(ev.score);
  });
  it('sums time', () => expect(ev.timeSpentSec).toBe(200));
});

describe('mcq_single', () => {
  const q = mk({ questionId: 'x' });
  it('multiple selections on a single-answer question are wrong', () => {
    expect(markQuestion(q, { questionId: 'x', selected: ['A', 'B'] })).toEqual({ result: 'incorrect', marks: -1 });
  });
  it('no negative marking when wrong = 0', () => {
    const z = mk({ questionId: 'z', marking: { correct: 1, wrong: 0 } });
    expect(markQuestion(z, { questionId: 'z', selected: ['B'] }).marks).toBe(0);
  });
  it('empty selection is unanswered', () => {
    expect(markQuestion(q, { questionId: 'x', selected: [] })).toEqual({ result: 'unanswered', marks: 0 });
    expect(markQuestion(q, undefined).result).toBe('unanswered');
  });
});

describe('mcq_multi partial marking', () => {
  const base = {
    type: 'mcq_multi' as const, correctOptions: ['A', 'B', 'C'],
  };
  const neg = mk({ ...base, questionId: 'm', marking: { correct: 4, wrong: 2, partial: { mode: 'per_correct_option', perCorrect: 1, onWrongOption: 'negative' } } });
  const zero = mk({ ...base, questionId: 'm', marking: { correct: 4, wrong: 2, partial: { mode: 'per_correct_option', perCorrect: 1, onWrongOption: 'zero' } } });
  const none = mk({ ...base, questionId: 'm', marking: { correct: 4, wrong: 2 } });
  const sel = (...s: string[]) => ({ questionId: 'm', selected: s });

  it('all correct, nothing wrong = full marks', () => {
    expect(markQuestion(neg, sel('C', 'B', 'A'))).toEqual({ result: 'correct', marks: 4 });
  });
  it('some correct none wrong = +1 per correct', () => {
    expect(markQuestion(neg, sel('A'))).toEqual({ result: 'partial', marks: 1 });
    expect(markQuestion(neg, sel('A', 'C'))).toEqual({ result: 'partial', marks: 2 });
  });
  it('any wrong option: negative per config', () => {
    expect(markQuestion(neg, sel('A', 'B', 'D'))).toEqual({ result: 'incorrect', marks: -2 });
  });
  it('any wrong option: zero per config', () => {
    expect(markQuestion(zero, sel('A', 'D'))).toEqual({ result: 'incorrect', marks: 0 });
  });
  it('no partial config = all-or-nothing', () => {
    expect(markQuestion(none, sel('A', 'B'))).toEqual({ result: 'incorrect', marks: -2 });
  });
  it('partial never exceeds full marks', () => {
    const big = mk({ ...base, questionId: 'm', marking: { correct: 2, wrong: 0, partial: { mode: 'per_correct_option', perCorrect: 5, onWrongOption: 'zero' } } });
    expect(markQuestion(big, sel('A')).marks).toBe(2);
  });
});

describe('numeric', () => {
  const q = (tolerance: any, extra = {}) =>
    mk({ questionId: 'n', type: 'numeric', correctOptions: undefined, numeric: { value: 10, tolerance, ...extra } });
  const a = (v: any) => ({ questionId: 'n', numeric: v });

  it('abs tolerance inclusive', () => {
    expect(markQuestion(q({ mode: 'abs', value: 0.01 }), a('10.01')).result).toBe('correct');
    expect(markQuestion(q({ mode: 'abs', value: 0.01 }), a('10.02')).result).toBe('incorrect');
  });
  it('exact', () => {
    expect(markQuestion(q({ mode: 'exact' }), a(10)).result).toBe('correct');
    expect(markQuestion(q({ mode: 'exact' }), a(10.0001)).result).toBe('incorrect');
  });
  it('relative tolerance', () => {
    expect(markQuestion(q({ mode: 'rel', value: 0.05 }), a(10.5)).result).toBe('correct');
    expect(markQuestion(q({ mode: 'rel', value: 0.05 }), a(10.6)).result).toBe('incorrect');
  });
  it('alternate answers accepted', () => {
    expect(markQuestion(q({ mode: 'exact' }, { alternates: [12] }), a(12)).result).toBe('correct');
  });
  it('blank / non-numeric input is unanswered', () => {
    expect(markQuestion(q({ mode: 'exact' }), a('  ')).result).toBe('unanswered');
    expect(markQuestion(q({ mode: 'exact' }), a('abc')).result).toBe('unanswered');
    expect(markQuestion(q({ mode: 'exact' }), a(null)).result).toBe('unanswered');
  });
  it('thousands separators and negative numbers parse', () => {
    const k = mk({ questionId: 'n', type: 'numeric', correctOptions: undefined, numeric: { value: -1500, tolerance: { mode: 'exact' } } });
    expect(markQuestion(k, a('-1,500')).result).toBe('correct');
  });
  it('numericMatches handles floating error', () => {
    expect(numericMatches(0.1 + 0.2, 0.3, { mode: 'abs', value: 0 })).toBe(true);
  });
});

describe('dropped questions', () => {
  it('award_all gives full marks even if unanswered', () => {
    const ev = evaluate({ attemptId: 'a', keyVersion: 1, schemeVersion: 1, questions: [mk({ questionId: 'd', dropped: 'award_all' })], answers: [] });
    expect(ev.score).toBe(4);
    expect(ev.maxScore).toBe(4);
  });
  it('void removes the question from score, max and counts', () => {
    const ev = evaluate({
      attemptId: 'a', keyVersion: 1, schemeVersion: 1,
      questions: [mk({ questionId: 'd', dropped: 'void' }), mk({ questionId: 'e' })],
      answers: [{ questionId: 'd', selected: ['B'] }, { questionId: 'e', selected: ['A'] }],
    });
    expect(ev).toMatchObject({ score: 4, maxScore: 4, correct: 1, incorrect: 0 });
  });
});

describe('float safety', () => {
  it('ten +0.1 partials sum exactly', () => {
    const qs = Array.from({ length: 10 }, (_, i) => mk({
      questionId: `q${i}`, type: 'mcq_multi', correctOptions: ['A', 'B'],
      marking: { correct: 1, wrong: 0, partial: { mode: 'per_correct_option', perCorrect: 0.1, onWrongOption: 'zero' } },
    }));
    const ev = evaluate({ attemptId: 'a', keyVersion: 1, schemeVersion: 1, questions: qs, answers: qs.map((q) => ({ questionId: q.questionId, selected: ['A'] })) });
    expect(ev.score).toBe(1);
  });
});

describe('AT-13 answer key corrected after test: versioned results', () => {
  const qs = [mk({ questionId: 'q1', correctOptions: ['A'] }), mk({ questionId: 'q2', correctOptions: ['B'] })];
  const answers = [{ questionId: 'q1', selected: ['A'] }, { questionId: 'q2', selected: ['C'] }];
  const v1 = evaluate({ attemptId: 'a', keyVersion: 1, schemeVersion: 1, questions: qs, answers });
  const fixed = [qs[0]!, { ...qs[1]!, correctOptions: ['C'] }];
  const { next: v2, diff } = reevaluate(v1, { keyVersion: 2, schemeVersion: 1, questions: fixed, answers });

  it('creates version 2 and leaves version 1 unchanged', () => {
    expect(v2.version).toBe(2);
    expect(v2.keyVersion).toBe(2);
    expect(v1.version).toBe(1);
    expect(v1.score).toBe(3);
    expect(v2.score).toBe(8);
  });
  it('reports which questions changed', () => {
    expect(diff).toEqual({ scoreBefore: 3, scoreAfter: 8, changedQuestions: [{ questionId: 'q2', before: -1, after: 4 }] });
  });
  it('is pure: same input yields same output', () => {
    expect(evaluate({ attemptId: 'a', keyVersion: 1, schemeVersion: 1, questions: qs, answers })).toEqual(v1);
  });
});

describe('ranking', () => {
  const e = (id: string, score: number, o: Partial<RankEntry> = {}): RankEntry => ({
    attemptId: id, studentId: `s-${id}`, attemptNo: 1, score, incorrect: 0, section1Score: 0, timeSpentSec: 0, ...o,
  });

  it('AT-14: ties share a rank and the next rank is skipped (1,2,2,4)', () => {
    const rows = computeRanks([e('a', 90), e('b', 80), e('c', 80), e('d', 70)], 'test', null);
    expect(rows.map((r) => [r.attemptId, r.rank])).toEqual([['a', 1], ['b', 2], ['c', 2], ['d', 4]]);
  });
  it('only first attempts are ranked', () => {
    const rows = computeRanks([e('a', 50), e('b', 99, { attemptNo: 2 })], 'test', null);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attemptId).toBe('a');
  });
  it('tie-breakers apply in order: fewer incorrect, section 1, less time', () => {
    const rows = computeRanks(
      [e('a', 80, { incorrect: 3 }), e('b', 80, { incorrect: 1 }), e('c', 80, { incorrect: 1, section1Score: 30, timeSpentSec: 5 }), e('d', 80, { incorrect: 1, section1Score: 30 })],
      'test', null, { tieBreakers: ['fewer_incorrect', 'higher_section1', 'less_time'] },
    );
    expect(rows.map((r) => r.attemptId)).toEqual(['d', 'c', 'b', 'a']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
  it('a still-tied pair after tie-breakers keeps the same rank', () => {
    const rows = computeRanks([e('a', 80, { incorrect: 1 }), e('b', 80, { incorrect: 1 }), e('c', 80, { incorrect: 2 })], 'test', null, { tieBreakers: ['fewer_incorrect'] });
    expect(rows.map((r) => r.rank).sort()).toEqual([1, 1, 3]);
  });
  it('percentile is null below 30 participants', () => {
    const rows = computeRanks([e('a', 90), e('b', 80)], 'test', null);
    expect(rows.every((r) => r.percentile === null)).toBe(true);
  });
  it('percentile = strictly below / total * 100 at 30+ participants', () => {
    const entries = Array.from({ length: 40 }, (_, i) => e(`p${i}`, i)); // scores 0..39
    const rows = computeRanks(entries, 'test', null);
    const top = rows.find((r) => r.attemptId === 'p39')!;
    expect(top.rank).toBe(1);
    expect(top.percentile).toBe(97.5);
    expect(rows.find((r) => r.attemptId === 'p0')!.percentile).toBe(0);
  });
  it('tied students share the same percentile', () => {
    const entries = [...Array.from({ length: 30 }, (_, i) => e(`p${i}`, i)), e('t1', 100), e('t2', 100)];
    const rows = computeRanks(entries, 'test', null);
    expect(rows.find((r) => r.attemptId === 't1')!.percentile).toBe(rows.find((r) => r.attemptId === 't2')!.percentile);
    expect(rows.find((r) => r.attemptId === 't1')!.percentile).toBe(Math.round((30 / 32) * 10000) / 100);
  });
  it('configurable percentile threshold', () => {
    const rows = computeRanks([e('a', 9), e('b', 8)], 'test', null, { minParticipantsForPercentile: 2 });
    expect(rows[0]!.percentile).toBe(50);
  });
  it('empty input', () => expect(computeRanks([], 'test', null)).toEqual([]));
  it('computeAllScopes ranks within each batch separately', () => {
    const rows = computeAllScopes([e('a', 90, { batchId: 'B1' }), e('b', 80, { batchId: 'B2' }), e('c', 70, { batchId: 'B2' })]);
    const batch = rows.filter((r) => r.scope === 'batch');
    expect(batch.find((r) => r.attemptId === 'b')).toMatchObject({ rank: 1, scopeId: 'B2' });
    expect(batch.find((r) => r.attemptId === 'a')).toMatchObject({ rank: 1, scopeId: 'B1' });
    expect(rows.find((r) => r.scope === 'test' && r.attemptId === 'b')!.rank).toBe(2);
  });
});

describe('insights', () => {
  it('recommendations require >= 5 attempts on the topic', () => {
    expect(recommend([{ topicId: 't', topicName: 'Percentages', attempted: 4, correct: 0, total: 4 }])).toEqual([]);
  });
  it('recommendation shows its reason and next step', () => {
    const [r] = recommend([{ topicId: 't', topicName: 'Percentages', attempted: 8, correct: 3, total: 8 }]);
    expect(r!.reason).toBe("You answered 3 of 8 'Percentages' questions correctly in your recent tests (37.5%).");
    expect(r!.next).toContain('15-question practice set');
  });
  it('strong topics get no recommendation', () => {
    expect(recommend([{ topicId: 't', topicName: 'X', attempted: 10, correct: 9, total: 10 }])).toEqual([]);
  });
  it('flags frequently skipped topics', () => {
    const [r] = recommend([{ topicId: 't', topicName: 'Algebra', attempted: 1, correct: 1, total: 6 }]);
    expect(r!.kind).toBe('skipped');
  });
  it('reteach list: batch accuracy < 50%, worst first', () => {
    const l = reteachList([
      { topicId: 'a', topicName: 'A', correct: 40, attempted: 100 },
      { topicId: 'b', topicName: 'B', correct: 20, attempted: 100 },
      { topicId: 'c', topicName: 'C', correct: 80, attempted: 100 },
      { topicId: 'd', topicName: 'D', correct: 0, attempted: 2 },
    ]);
    expect(l.map((x) => x.topicId)).toEqual(['b', 'a']);
  });
  it('declining: 3 consecutive drops', () => {
    const p = (s: number[]) => s.map((scorePct, i) => ({ testId: `t${i}`, at: new Date(2026, 0, i + 1), scorePct }));
    expect(isDeclining(p([80, 70, 60, 50]))).toBe(true);
    expect(isDeclining(p([80, 70, 75, 50]))).toBe(false);
    expect(isDeclining(p([80, 70, 60]))).toBe(false);
    expect(isDeclining(p([10, 90, 80, 70, 60]))).toBe(true);
  });
  it('median and distribution', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
    const d = distribution([0, 5, 10, 99, 100]);
    expect(d[0]!.count).toBe(2);
    expect(d[1]!.count).toBe(1);
    expect(d[9]!.count).toBe(2);
  });
});
