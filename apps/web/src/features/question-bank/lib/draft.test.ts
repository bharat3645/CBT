import { describe, expect, it } from 'vitest';
import type { RichDoc } from '@cbt/contracts';
import { addOption, changeType, emptyDraft, payloadToDraft, removeOption, toggleCorrect, validateDraft } from './draft';

const t = (s: string): RichDoc => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: s }] }] });

function filledMcq() {
  const d = emptyDraft('mcq_single');
  d.stem = t('What is 2+2?');
  d.options = d.options.map((o, i) => ({ ...o, content: t(String(i)) }));
  return d;
}

describe('draft helpers', () => {
  it('single choice replaces the correct answer, multi toggles', () => {
    let d = toggleCorrect(filledMcq(), 'A');
    d = toggleCorrect(d, 'B');
    expect(d.correct).toEqual(['B']);
    let m = changeType(d, 'mcq_multi');
    m = toggleCorrect(toggleCorrect(m, 'A'), 'C');
    expect(m.correct).toEqual(['B', 'A', 'C']);
    expect(toggleCorrect(m, 'A').correct).toEqual(['B', 'C']);
  });
  it('switching multi -> single trims to one answer', () => {
    const d = changeType({ ...filledMcq(), type: 'mcq_multi', correct: ['A', 'B'] }, 'mcq_single');
    expect(d.correct).toEqual(['A']);
  });
  it('adds and removes options, never below two', () => {
    let d = addOption(filledMcq());
    expect(d.options.map((o) => o.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    d = removeOption(toggleCorrect(d, 'E'), 'E');
    expect(d.correct).toEqual([]);
    const two = { ...d, options: d.options.slice(0, 2) };
    expect(removeOption(two, 'A').options).toHaveLength(2);
  });
});

describe('validateDraft', () => {
  it('reports missing content', () => {
    const r = validateDraft(emptyDraft());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(expect.arrayContaining(['Question text is required', 'Every option needs text', 'Mark the correct answer']));
  });
  it('accepts a complete MCQ and round-trips through payloadToDraft', () => {
    const r = validateDraft(toggleCorrect(filledMcq(), 'C'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toMatchObject({ type: 'mcq_single', correct: ['C'] });
      expect(payloadToDraft(r.payload).correct).toEqual(['C']);
    }
  });
  it('validates numeric answers', () => {
    const d = { ...emptyDraft('numeric'), stem: t('g = ?') };
    expect(validateDraft(d).ok).toBe(false);
    expect(validateDraft({ ...d, numeric: { answer: 9.8, tolerance: 0.1, toleranceKind: 'absolute' } }).ok).toBe(true);
  });
  it('subjective needs only a stem', () => {
    expect(validateDraft({ ...emptyDraft('subjective'), stem: t('Explain') }).ok).toBe(true);
  });
});
