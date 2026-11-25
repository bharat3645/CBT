import { api } from '@/lib/api-client';
import type { DuplicateCandidate, QuestionPayload, QuestionSummary, QuestionVersion, SearchQuestions } from '@cbt/contracts';

const http = api;

export const questionApi = {
  search(q: Partial<SearchQuestions>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') sp.set(k, String(v));
    return http<{ items: QuestionSummary[]; total: number }>(`/questions?${sp}`);
  },
  get: (id: string) => http<QuestionVersion>(`/questions/${id}`),
  versions: (id: string) => http<QuestionVersion[]>(`/questions/${id}/versions`),
  checkDuplicates: (stemText: string, excludeQuestionId?: string) =>
    http<DuplicateCandidate[]>('/questions/duplicates', { method: 'POST', body: { stemText, excludeQuestionId } }),
  create: (payload: QuestionPayload) =>
    http<{ id: string; code: string; version: number; duplicates: DuplicateCandidate[] }>('/questions', {
      method: 'POST',
      body: { payload },
    }),
  update: (id: string, payload: QuestionPayload, changeNote?: string) =>
    http<{ id: string; version: number; duplicates: DuplicateCandidate[] }>(`/questions/${id}`, {
      method: 'PUT',
      body: { payload, changeNote },
    }),
};

export interface TopicChoice {
  id: string;
  label: string;
}

/** Topics from the syllabus tree, labelled "Subject > Chapter > Topic". */
export async function fetchTopicChoices(): Promise<TopicChoice[]> {
  type N = { id: string; level: string; name: string; children: N[] };
  const tree = await http<N[]>('/syllabus/tree');
  const out: TopicChoice[] = [];
  const walk = (n: N, trail: string[]) => {
    const next = n.level === 'exam' ? trail : [...trail, n.name];
    if (n.level === 'topic') out.push({ id: n.id, label: next.slice(-3).join(' > ') });
    n.children?.forEach((c) => walk(c, next));
  };
  tree.forEach((n) => walk(n, []));
  return out;
}
