"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export type AppNotification = { id: string; type: string; title: string; body: string; data: Record<string, unknown>; readAt: string | null; createdAt: string };

export const useNotifications = (opts: { limit?: number; enabled?: boolean } = {}) =>
  useQuery({
    queryKey: ["notifications", opts.limit ?? 30],
    queryFn: () => api<AppNotification[]>("/notifications", { query: { limit: opts.limit ?? 30 } }),
    enabled: opts.enabled ?? true,
  });

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST", body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST", body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
