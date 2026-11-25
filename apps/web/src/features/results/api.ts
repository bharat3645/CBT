import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import type { BatchAnalytics, ResultView, StudentAnalytics, LeaderboardRow } from '@cbt/contracts/results';

/** Shared transport, with friendlier wording for the two statuses students actually hit. */
async function get<T>(path: string): Promise<T> {
  try {
    return await api<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) throw new Error('Result not released yet');
    if (e instanceof ApiError && e.status === 404) throw new Error('Not found');
    throw e;
  }
}

export const useResult = (attemptId: string) =>
  useQuery({ queryKey: ['result', attemptId], queryFn: () => get<ResultView>(`/results/${attemptId}`), retry: false });

export const useMyResults = () =>
  useQuery({ queryKey: ['results', 'mine'], queryFn: () => get<{ attemptId: string; title: string; score: number; maxScore: number; evaluatedAt: string }[]>('/results/mine') });

export const useMyAnalytics = (enabled = true) =>
  useQuery({ queryKey: ['analytics', 'me'], queryFn: () => get<StudentAnalytics>('/analytics/me'), enabled });

/** Parent: a linked child's released results / analytics (ids are the child's USER id; the API checks the guardian link). */
export const useChildResults = (childUserId?: string) =>
  useQuery({
    queryKey: ['results', 'child', childUserId],
    queryFn: () => get<{ attemptId: string; testId: string; title: string; score: number; maxScore: number; evaluatedAt: string }[]>(`/results/mine?childId=${childUserId}`),
    enabled: !!childUserId,
  });

export const useStudentAnalytics = (studentUserId?: string) =>
  useQuery({ queryKey: ['analytics', 'student', studentUserId], queryFn: () => get<StudentAnalytics>(`/analytics/students/${studentUserId}`), enabled: !!studentUserId });

export const useBatchAnalytics = (p: { batchId?: string; testId?: string; reteachThreshold?: number }) => {
  const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
  return useQuery({ queryKey: ['analytics', 'batch', qs], queryFn: () => get<BatchAnalytics>(`/analytics/batch?${qs}`) });
};

export const useLeaderboard = (testId: string, scope: 'test' | 'batch' = 'test', scopeId?: string) =>
  useQuery({
    queryKey: ['leaderboard', testId, scope, scopeId],
    queryFn: () => get<{ label: string; rows: LeaderboardRow[] }>(`/tests/${testId}/leaderboard?scope=${scope}${scopeId ? `&scopeId=${scopeId}` : ''}`),
  });

export const reportUrl = (attemptId: string) => `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1/results/${attemptId}/report.pdf`;
