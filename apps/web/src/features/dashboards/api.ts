"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardData } from "@cbt/contracts/dashboard";
import { api } from "@/lib/api-client";

/** One query feeds both the page body and the sidebar badges, so the shell never adds a second request. */
export function useDashboard(opts: { childId?: string | null; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["dashboard", opts.childId ?? null],
    queryFn: () => api<DashboardData>("/dashboard", { query: { childId: opts.childId ?? undefined } }),
    enabled: opts.enabled ?? true,
    staleTime: 20_000,
  });
}
