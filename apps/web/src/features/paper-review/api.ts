import type { ApprovalBlocked, PaperDetail, PaperSummary, UpdateDraft } from '@cbt/contracts';

const BASE = '/api/v1/ingestion/papers';

export class ApprovalBlockedError extends Error {
  constructor(public readonly body: ApprovalBlocked) {
    super(body.message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...(init?.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
  if (res.status === 422) {
    const body = await res.json().catch(() => null);
    if (body && 'openFlags' in body) throw new ApprovalBlockedError(body as ApprovalBlocked);
    throw new Error(body?.message ?? 'Unprocessable');
  }
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? res.statusText);
  return res.json() as Promise<T>;
}

export const paperApi = {
  list: () => req<PaperSummary[]>(''),
  get: (id: string) => req<PaperDetail>(`/${id}`),
  upload: (file: File, title?: string) => {
    const fd = new FormData();
    fd.set('file', file);
    if (title) fd.set('title', title);
    return req<{ id: string; status: string }>('', { method: 'POST', body: fd });
  },
  updateDraft: (id: string, draftId: string, patch: UpdateDraft) =>
    req<{ ok: true }>(`/${id}/drafts/${draftId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  setAnswerKey: (id: string, input: { text?: string; key?: Record<string, string> }) =>
    req<{ answerKey: Record<string, string>; mapped: number }>(`/${id}/answer-key`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  approve: (id: string) => req<{ id: string; status: 'approved' }>(`/${id}/approve`, { method: 'POST' }),
};
