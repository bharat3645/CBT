"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import type { ChildSummary } from "@cbt/contracts/dashboard";
import { api } from "@/lib/api-client";

const KEY = "cbt.parent.child";

const useChildStore = create<{ childId: string | null; hydrated: boolean; set: (id: string) => void; hydrate: () => void }>((set) => ({
  childId: null,
  hydrated: false,
  set: (id) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* private mode: selection just lasts for the session */
    }
    set({ childId: id });
  },
  hydrate: () => {
    let id: string | null = null;
    try {
      id = localStorage.getItem(KEY);
    } catch {
      /* ignore */
    }
    set({ childId: id, hydrated: true });
  },
}));

/** The parent's verified linked children (real guardian links) and which one is being viewed. */
export function useSelectedChild(enabled = true) {
  const { childId, hydrated, set, hydrate } = useChildStore();
  React.useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);
  const q = useQuery({ queryKey: ["children"], queryFn: () => api<ChildSummary[]>("/children"), enabled, staleTime: 60_000 });
  const children = q.data ?? [];
  const child = children.find((c) => c.studentId === childId) ?? children[0] ?? null;
  return { children, child, setChild: set, isLoading: q.isLoading || !hydrated, error: q.error };
}
