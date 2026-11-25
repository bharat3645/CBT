"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiText } from "@/lib/api-client";

export type PersonRole = "student" | "teacher" | "parent";

export type Person = {
  id: string; // user id
  name: string;
  email: string;
  phone: string | null;
  role: "institute_admin" | PersonRole;
  status: "active" | "inactive";
  rollNo: string | null;
  studentId: string | null;
  teacherId: string | null;
  guardianId: string | null;
  employeeCode: string | null;
  batchNames: string[];
  childNames: string[];
};

export type BatchRow = {
  id: string;
  name: string;
  code: string | null;
  year: number | null;
  status: "active" | "archived";
  examId: string | null;
  studentCount: number;
  teacherCount: number;
};

export type GuardianLink = { guardianId: string; studentId: string; status: string; guardianName: string; studentName: string; rollNo: string | null };

export type ImportResult = {
  id: string;
  status: string;
  filename: string | null;
  totalRows: number;
  succeededRows: number;
  failedRows: number;
  errors: { row: number; field?: string; message: string }[];
};

export const PAGE_SIZE = 25;

export function usePeople(p: { role?: PersonRole; q?: string; batchId?: string; offset?: number; limit?: number }) {
  const limit = p.limit ?? PAGE_SIZE;
  return useQuery({
    queryKey: ["people", p.role ?? "all", p.q ?? "", p.batchId ?? "", p.offset ?? 0, limit],
    queryFn: () => api<Person[]>("/users", { query: { role: p.role, q: p.q || undefined, batchId: p.batchId, limit, offset: p.offset ?? 0 } }),
    placeholderData: keepPreviousData,
  });
}

export const useBatches = (opts: { enabled?: boolean } = {}) => useQuery({ queryKey: ["batches"], queryFn: () => api<BatchRow[]>("/batches"), enabled: opts.enabled ?? true });

export const useGuardianLinks = (guardianId?: string) =>
  useQuery({ queryKey: ["guardian-links", guardianId ?? "all"], queryFn: () => api<GuardianLink[]>("/guardian-links", { query: { guardianId } }) });

/** Invalidate everything people/batch related plus the numbers derived from it (dashboard, badges). */
export function useRefreshPeople() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["people", "batches", "batch", "guardian-links", "dashboard", "children"]) void qc.invalidateQueries({ queryKey: [k] });
  };
}

export type NewPerson = {
  role: PersonRole;
  name: string;
  email: string;
  phone?: string;
  rollNo?: string;
  dob?: string;
  employeeCode?: string;
  qualification?: string;
  relation?: string;
  batchIds: string[];
  childStudentIds: string[];
};

export function useCreatePerson() {
  const refresh = useRefreshPeople();
  return useMutation({ mutationFn: (p: NewPerson) => api<{ id: string }>("/users", { method: "POST", body: p }), onSuccess: refresh });
}

export function useSetPersonStatus() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (v: { id: string; status: "active" | "inactive" }) => api(`/users/${v.id}`, { method: "PATCH", body: { status: v.status } }),
    onSuccess: refresh,
  });
}

export function useLinkGuardian() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (v: { guardianId: string; studentId: string }) => api("/guardian-links", { method: "POST", body: v }),
    onSuccess: refresh,
  });
}

export function useUnlinkGuardian() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (v: { guardianId: string; studentId: string }) => api(`/guardian-links/${v.guardianId}/${v.studentId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}

/** POST /imports/users as JSON { csv, filename }: the API answers 200 with per-row errors even when some rows fail. */
export function useImportUsers() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (v: { csv: string; filename?: string }) => api<ImportResult>("/imports/users", { method: "POST", body: v }),
    onSuccess: refresh,
  });
}

/** Fetch text (CSV) with the session cookie, then hand it to the browser as a download. */
export async function downloadCsv(path: string, filename: string) {
  const blob = new Blob([await apiText(path)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
