import { describe, expect, it } from 'vitest';
import { evaluateApproval, parseAnswerKeyText, type GateDraft } from './approval-gate';
import { parseClamReply } from './clamav.scanner';

const d = (n: number, over: Partial<GateDraft> = {}): GateDraft => ({
  id: `id${n}`,
  number: n,
  type: 'mcq',
  answer: null,
  flags: [],
  ...over,
});

describe('approval gate', () => {
  it('passes when no open flags and key complete', () => {
    expect(evaluateApproval([d(1), d(2)], { '1': 'A', '2': 'B' }).ok).toBe(true);
  });
  it('blocks on open error flag', () => {
    const r = evaluateApproval([d(1, { flags: [{ code: 'NO_OPTIONS', severity: 'error', resolved: false }] })], { '1': 'A' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.openFlags[0]!.codes).toEqual(['NO_OPTIONS']);
  });
  it('resolved flags and warnings do not block', () => {
    const r = evaluateApproval(
      [
        d(1, {
          flags: [
            { code: 'X', severity: 'error', resolved: true },
            { code: 'NUMBER_GAP', severity: 'warning', resolved: false },
          ],
        }),
      ],
      { '1': 'A' },
    );
    expect(r.ok).toBe(true);
  });
  it('blocks on missing key and lists numbers', () => {
    const r = evaluateApproval([d(1), d(2), d(3, { answer: 'C' })], { '1': 'A' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.missingKey).toEqual([2]);
  });
  it('blocks empty paper', () => {
    expect(evaluateApproval([], {}).ok).toBe(false);
  });
});

describe('answer key text', () => {
  it('parses mixed formats', () => {
    expect(parseAnswerKeyText('1-A, 2.(b) Q3: D\n4: 42.5')).toEqual({ '1': 'A', '2': 'B', '3': 'D', '4': '42.5' });
  });
  it('first occurrence wins', () => {
    expect(parseAnswerKeyText('1-A 1-B')).toEqual({ '1': 'A' });
  });
});

describe('clamd reply', () => {
  it('parses', () => {
    expect(parseClamReply('stream: OK\0').status).toBe('clean');
    expect(parseClamReply('stream: Eicar-Test-Signature FOUND\0')).toEqual({
      status: 'infected',
      signature: 'Eicar-Test-Signature',
    });
    expect(parseClamReply('').status).toBe('error');
  });
});
