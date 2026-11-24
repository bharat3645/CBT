import type { DuplicateCandidate, QuestionPayload, QuestionSummary, QuestionVersion, SearchQuestions } from '@cbt/contracts';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const questionApi = {
  search(q: Partial<SearchQuestions>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') sp.set(k, String(v));
    return http<{ items: QuestionSummary[]; total: number }>(`/questions?${sp}`);
  },
  get: (id: string) => http<QuestionVersion>(`/questions/${id}`),
  versions: (id: string) => http<QuestionVersion[]>(`/questions/${id}/versions`),
  checkDuplicates: (stemText: string, excludeQuestionId?: string) =>
    http<DuplicateCandidate[]>('/questions/duplicates', { method: 'POST', body: JSON.stringify({ stemText, excludeQuestionId }) }),
  create: (payload: QuestionPayload) =>
    http<{ id: string; code: string; version: number; duplicates: DuplicateCandidate[] }>('/questions', {
      method: 'POST',
      body: JSON.stringify({ payload }),
    }),
  update: (id: string, payload: QuestionPayload, changeNote?: string) =>
    http<{ id: string; version: number; duplicates: DuplicateCandidate[] }>(`/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ payload, changeNote }),
    }),
};
