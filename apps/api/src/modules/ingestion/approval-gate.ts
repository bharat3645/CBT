import type { ApprovalBlocked } from '@cbt/contracts';

export interface GateDraft {
  id: string;
  number: number;
  type: 'mcq' | 'assertion_reason' | 'numeric';
  answer: string | null;
  flags: { code: string; severity: 'error' | 'warning'; resolved: boolean }[];
}

/** Effective answer: per-draft answer wins, otherwise the paper's answer key. */
export function effectiveAnswer(d: GateDraft, key: Record<string, string>): string | null {
  const a = d.answer ?? key[String(d.number)] ?? null;
  return a && a.trim() ? a : null;
}

export function evaluateApproval(
  drafts: GateDraft[],
  key: Record<string, string>,
): { ok: true } | { ok: false; body: ApprovalBlocked } {
  if (drafts.length === 0) {
    return { ok: false, body: { statusCode: 422, message: 'Paper has no questions', openFlags: [], missingKey: [] } };
  }
  const openFlags = drafts
    .map((d) => ({
      draftId: d.id,
      number: d.number,
      codes: d.flags.filter((f) => f.severity === 'error' && !f.resolved).map((f) => f.code),
    }))
    .filter((x) => x.codes.length > 0);
  const missingKey = drafts.filter((d) => effectiveAnswer(d, key) === null).map((d) => d.number);
  if (openFlags.length === 0 && missingKey.length === 0) return { ok: true };

  const parts: string[] = [];
  if (openFlags.length) parts.push(`${openFlags.length} question(s) have open flags`);
  if (missingKey.length) parts.push(`${missingKey.length} question(s) have no answer key`);
  return { ok: false, body: { statusCode: 422, message: parts.join('; '), openFlags, missingKey } };
}

/** Accepts "1-A, 2.(b) Q3: D" or one per line; numeric answers like "4: 42.5" are kept as-is. */
export function parseAnswerKeyText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(?:Q\.?\s*)?(\d{1,3})\s*[.):\-=]\s*\(?\s*([A-Ea-e]|-?\d+(?:\.\d+)?)\s*\)?(?=[\s,;]|$)/g;
  for (const m of text.matchAll(re)) {
    const raw = m[2]!;
    const val = /^[a-e]$/i.test(raw) ? raw.toUpperCase() : raw;
    out[String(Number(m[1]))] ??= val;
  }
  return out;
}
