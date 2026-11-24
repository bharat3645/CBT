import type { PayloadLike } from './keys';

/** Answer-key correction applied on top of a stored question payload (FR-056). */
export interface KeyChange {
  correct?: string[];
  numeric?: { answer: number; tolerance?: number; toleranceKind?: 'absolute' | 'percent' };
  dropped?: 'award_all' | 'void';
}
export interface KeyRevision { keyVersion: number; questionId: string; change: KeyChange }

/**
 * Apply revisions (ordered by keyVersion) with keyVersion <= upTo. Pure; does not mutate the payload.
 * Evaluating at keyVersion N therefore always reproduces the same key, so old result versions stay explainable.
 */
export function applyRevisions(
  questionId: string, payload: PayloadLike, revisions: KeyRevision[], upTo: number,
): { payload: PayloadLike; dropped?: 'award_all' | 'void' } {
  let p: PayloadLike = { ...payload };
  let dropped: 'award_all' | 'void' | undefined;
  const mine = revisions.filter((r) => r.questionId === questionId && r.keyVersion <= upTo)
    .sort((a, b) => a.keyVersion - b.keyVersion);
  for (const r of mine) {
    if (r.change.correct) p = { ...p, correct: r.change.correct };
    if (r.change.numeric) p = { ...p, numeric: { ...p.numeric, ...r.change.numeric } };
    if (r.change.dropped) dropped = r.change.dropped;
  }
  return { payload: p, dropped };
}

/** Back-off for notification retries: 30s, 60s, 2m, 4m ... capped at 1h. attempt is 1-based count of failures so far. */
export function backoffMs(attempt: number, baseMs = 30_000, capMs = 3_600_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
}

export function dedupeKey(parts: (string | number)[]): string {
  return parts.join(':');
}
