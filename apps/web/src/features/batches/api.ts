"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useRefreshPeople, type BatchRow } from "@/features/people/api";

export const useBatch = (id: string) => useQuery({ queryKey: ["batch", id], queryFn: () => api<BatchRow>(`/batches/${id}`), retry: false });

export function useCreateBatch() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (v: { name: string; code?: string; year?: number }) => api<BatchRow>("/batches", { method: "POST", body: v }),
    onSuccess: refresh,
  });
}

export function useUpdateBatch(id: string) {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (v: { name?: string; code?: string; status?: "active" | "archived" }) => api<BatchRow>(`/batches/${id}`, { method: "PATCH", body: v }),
    onSuccess: refresh,
  });
}

export function useEnrol(batchId: string) {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (studentIds: string[]) => api<{ enrolled: number; alreadyEnrolled: number }>(`/batches/${batchId}/students`, { method: "POST", body: { studentIds } }),
    onSuccess: refresh,
  });
}

export function useUnenrol(batchId: string) {
  const refresh = useRefreshPeople();
  return useMutation({ mutationFn: (studentId: string) => api(`/batches/${batchId}/students/${studentId}`, { method: "DELETE" }), onSuccess: refresh });
}

export function useAssignTeacher(batchId: string) {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (v: { teacherId: string; subject?: string }) => api(`/batches/${batchId}/teachers`, { method: "POST", body: { teacherIds: [v.teacherId], subject: v.subject } }),
    onSuccess: refresh,
  });
}

export function useUnassignTeacher(batchId: string) {
  const refresh = useRefreshPeople();
  return useMutation({ mutationFn: (teacherId: string) => api(`/batches/${batchId}/teachers/${teacherId}`, { method: "DELETE" }), onSuccess: refresh });
}
