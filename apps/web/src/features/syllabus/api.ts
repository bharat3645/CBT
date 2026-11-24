"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SyllabusLevel, SyllabusTreeNode, TopicProgress } from "@cbt/contracts/syllabus";
import { api } from "@/lib/api-client";

export type ProgressStatus = TopicProgress["status"];
export type BatchProgress = { progress: TopicProgress[]; overallPercent: number; percentByNode: Record<string, number> };

export const useSyllabusTree = () => useQuery({ queryKey: ["syllabus", "tree"], queryFn: () => api<SyllabusTreeNode[]>("/syllabus/tree") });
export const useTemplates = (enabled = true) =>
  useQuery({ queryKey: ["syllabus", "templates"], queryFn: () => api<SyllabusTreeNode[]>("/syllabus/templates"), enabled });
export const useBatchProgress = (batchId?: string) =>
  useQuery({
    queryKey: ["syllabus", "progress", batchId],
    queryFn: () => api<BatchProgress>(`/syllabus/batches/${batchId}/progress`),
    enabled: !!batchId,
  });

function useSyllabusMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["syllabus"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export const useCopyTemplate = () =>
  useSyllabusMutation((templateRootId: string) => api<{ rootId: string; nodes: number }>("/syllabus/templates/copy", { method: "POST", body: { templateRootId } }));

export const useCreateNode = () =>
  useSyllabusMutation((v: { parentId: string | null; level: SyllabusLevel; name: string; position: number }) => api("/syllabus/nodes", { method: "POST", body: v }));

export const useRenameNode = () => useSyllabusMutation((v: { id: string; name: string }) => api(`/syllabus/nodes/${v.id}`, { method: "PATCH", body: { name: v.name } }));

export const useDeleteNode = () => useSyllabusMutation((id: string) => api(`/syllabus/nodes/${id}`, { method: "DELETE" }));

export const useSetProgress = () =>
  useSyllabusMutation((v: { batchId: string; topicId: string; status: ProgressStatus }) =>
    api(`/syllabus/batches/${v.batchId}/progress/${v.topicId}`, { method: "PUT", body: { status: v.status } }),
  );
