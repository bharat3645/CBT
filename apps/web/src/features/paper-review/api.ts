import type { ApprovalBlocked, PaperDetail, PaperSummary, UpdateDraft } from '@cbt/contracts';

import { api, ApiError } from '@/lib/api-client';

const BASE = '/ingestion/papers';

export class ApprovalBlockedError extends Error {
  constructor(public readonly body: ApprovalBlocked) {
    super(body.message);
  }
}

/** Shared transport; only adds the paper-specific "approval blocked" (422 with open flags) error. */
async function req<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return await api<T>(`${BASE}${path}`, init);
  } catch (e) {
    const body = e instanceof ApiError && e.status === 422 ? e.body : undefined;
    if (body && typeof body === 'object' && 'openFlags' in body) throw new ApprovalBlockedError(body as ApprovalBlocked);
    throw e;
  }
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
    req<{ ok: true }>(`/${id}/drafts/${draftId}`, { method: 'PATCH', body: patch }),
  setAnswerKey: (id: string, input: { text?: string; key?: Record<string, string> }) =>
    req<{ answerKey: Record<string, string>; mapped: number }>(`/${id}/answer-key`, {
      method: 'PUT',
      body: input,
    }),
  approve: (id: string) => req<{ id: string; status: 'approved' }>(`/${id}/approve`, { method: 'POST' }),
};
