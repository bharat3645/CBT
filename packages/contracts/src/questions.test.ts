import { describe, expect, it } from 'vitest';
import { questionPayloadSchema, richDocToText, searchQuestionsSchema, type RichDoc } from './questions';
import { childLevel, createSyllabusNodeSchema } from './syllabus';

const p = (text: string): RichDoc => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const opts = [
  { id: 'A', content: p('1') },
  { id: 'B', content: p('2') },
];

describe('questionPayloadSchema', () => {
  it('accepts a single-correct MCQ and applies defaults', () => {
    const r = questionPayloadSchema.parse({ type: 'mcq_single', stem: p('Q'), options: opts, correct: ['A'] });
    expect(r.difficulty).toBe('medium');
    expect(r.marks).toBe(4);
  });
  it('rejects a correct answer that is not an option', () => {
    expect(questionPayloadSchema.safeParse({ type: 'mcq_single', stem: p('Q'), options: opts, correct: ['Z'] }).success).toBe(false);
  });
  it('rejects two correct answers for mcq_single but allows them for mcq_multi', () => {
    const base = { stem: p('Q'), options: opts, correct: ['A', 'B'] };
    expect(questionPayloadSchema.safeParse({ type: 'mcq_single', ...base }).success).toBe(false);
    expect(questionPayloadSchema.safeParse({ type: 'mcq_multi', ...base }).success).toBe(true);
  });
  it('rejects duplicate option ids', () => {
    const dup = [opts[0], opts[0]];
    expect(questionPayloadSchema.safeParse({ type: 'mcq_single', stem: p('Q'), options: dup, correct: ['A'] }).success).toBe(false);
  });
  it('validates numeric and subjective types', () => {
    expect(questionPayloadSchema.safeParse({ type: 'numeric', stem: p('Q'), numeric: { answer: 3.5, tolerance: 0.1 } }).success).toBe(true);
    expect(questionPayloadSchema.safeParse({ type: 'numeric', stem: p('Q') }).success).toBe(false);
    expect(questionPayloadSchema.safeParse({ type: 'subjective', stem: p('Q') }).success).toBe(true);
  });
});

describe('richDocToText', () => {
  it('flattens text and keeps LaTeX', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Solve ' }, { type: 'inlineMath', attrs: { latex: 'x^2=4' } }] }],
    };
    expect(richDocToText(doc)).toBe('Solve x^2=4');
  });
});

describe('searchQuestionsSchema', () => {
  it('coerces paging from query strings', () => {
    expect(searchQuestionsSchema.parse({ page: '2', pageSize: '10', difficulty: 'hard' })).toMatchObject({ page: 2, pageSize: 10 });
  });
});

describe('syllabus contracts', () => {
  it('walks levels', () => {
    expect(childLevel('exam')).toBe('subject');
    expect(childLevel('topic')).toBeNull();
  });
  it('requires a name', () => {
    expect(createSyllabusNodeSchema.safeParse({ level: 'exam', name: '  ' }).success).toBe(false);
  });
});
