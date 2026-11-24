import {
  DUPLICATE_THRESHOLD,
  richDocToText,
  type DuplicateCandidate,
  type QuestionPayload,
} from '@cbt/contracts';

/** Plain text used for search and pg_trgm similarity: stem + options, whitespace-normalised, lowercased. */
export function buildSearchText(p: QuestionPayload): string {
  const parts = [richDocToText(p.stem)];
  if (p.type === 'mcq_single' || p.type === 'mcq_multi') parts.push(...p.options.map((o) => richDocToText(o.content)));
  return parts.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function snippet(text: string, max = 140): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Keep candidates at/above the threshold, best first, capped. */
export function rankDuplicates(
  rows: Array<{ id: string; code: string; searchText: string; similarity: number }>,
  threshold = DUPLICATE_THRESHOLD,
  limit = 5,
): DuplicateCandidate[] {
  return rows
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((r) => ({
      questionId: r.id,
      label: r.code,
      similarity: Number(r.similarity.toFixed(3)),
      snippet: snippet(r.searchText),
    }));
}

export function duplicateWarning(c: DuplicateCandidate): string {
  return `Possible duplicate of ${c.label} (${Math.round(c.similarity * 100)}% similar)`;
}

/** Next per-institute short code: Q1, Q2, ... */
export function nextQuestionCode(existing: string[]): string {
  const max = existing.reduce((m, c) => Math.max(m, Number(/^Q(\d+)$/.exec(c)?.[1] ?? 0)), 0);
  return `Q${max + 1}`;
}
