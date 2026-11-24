export type RankScope = 'test' | 'batch' | 'institute';
export type TieBreaker = 'fewer_incorrect' | 'higher_section1' | 'less_time';

export interface RankEntry {
  attemptId: string;
  studentId: string;
  batchId?: string | null;
  attemptNo: number;
  score: number;
  incorrect: number;
  section1Score: number;
  timeSpentSec: number;
}

export interface RankRow {
  attemptId: string;
  studentId: string;
  scope: RankScope;
  scopeId: string | null;
  rank: number;
  /** null when participants < minParticipants */
  percentile: number | null;
  participants: number;
}

export interface RankOptions {
  tieBreakers?: TieBreaker[];
  /** SRS 10.3 proposes 30 */
  minParticipantsForPercentile?: number;
}

export const RANK_LABEL = 'Institute mock rank: not an official entrance exam rank';

const EPS = 1e-9;

function cmp(a: RankEntry, b: RankEntry, tb: TieBreaker[]): number {
  if (Math.abs(a.score - b.score) > EPS) return b.score - a.score;
  for (const t of tb) {
    let d = 0;
    if (t === 'fewer_incorrect') d = a.incorrect - b.incorrect;
    else if (t === 'higher_section1') d = b.section1Score - a.section1Score;
    else d = a.timeSpentSec - b.timeSpentSec;
    if (Math.abs(d) > EPS) return d;
  }
  return 0;
}

/**
 * Standard competition ranking (1,2,2,4). Only first attempts (attemptNo === 1) are ranked.
 * Percentile = students scoring strictly below / total * 100 (SRS 10.3).
 */
export function computeRanks(
  entries: RankEntry[], scope: RankScope, scopeId: string | null, opts: RankOptions = {},
): RankRow[] {
  const tb = opts.tieBreakers ?? [];
  const min = opts.minParticipantsForPercentile ?? 30;
  const ranked = entries.filter((e) => e.attemptNo === 1).sort((a, b) => cmp(a, b, tb));
  const n = ranked.length;
  const rows: RankRow[] = [];
  let rank = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0 || cmp(ranked[i - 1]!, ranked[i]!, tb) !== 0) rank = i + 1;
    const e = ranked[i]!;
    const below = ranked.filter((o) => o.score < e.score - EPS).length;
    rows.push({
      attemptId: e.attemptId, studentId: e.studentId, scope, scopeId, rank,
      percentile: n >= min ? Math.round((below / n) * 10000) / 100 : null,
      participants: n,
    });
  }
  return rows;
}

/** Test-level ranking plus one batch-level ranking per batch. */
export function computeAllScopes(entries: RankEntry[], opts: RankOptions = {}): RankRow[] {
  const out = computeRanks(entries, 'test', null, opts);
  const byBatch = new Map<string, RankEntry[]>();
  for (const e of entries) {
    if (!e.batchId) continue;
    const list = byBatch.get(e.batchId) ?? [];
    list.push(e);
    byBatch.set(e.batchId, list);
  }
  for (const [batchId, list] of byBatch) out.push(...computeRanks(list, 'batch', batchId, opts));
  return out;
}
