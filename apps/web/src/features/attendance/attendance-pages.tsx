"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cbt/ui";
import { api } from "@/lib/api-client";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Field, Loading, Panel, Pill, SuccessNote, Table, Td, inputCls } from "@/components/ui-kit";
import { useBatches } from "@/features/people/api";
import { useSelectedChild } from "@/features/parent/child";

type Status = "present" | "absent" | "late" | "excused";
const STATUSES: Status[] = ["present", "absent", "late", "excused"];
const tone = (s?: string | null) => (s === "present" ? "good" : s === "absent" ? "bad" : s === "late" ? "warn" : "neutral");
const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------ attendance: teacher ------------------------------ */
type RosterRow = { studentUserId: string; name: string; rollNo: string | null; status: Status | null };

export function TeacherAttendancePage() {
  const batches = useBatches();
  const qc = useQueryClient();
  const [batchId, setBatchId] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [marks, setMarks] = React.useState<Record<string, Status>>({});
  React.useEffect(() => {
    if (!batchId && batches.data?.length) setBatchId(batches.data[0]!.id);
  }, [batches.data, batchId]);
  const roster = useQuery({
    queryKey: ["attendance-roster", batchId, date],
    queryFn: () => api<RosterRow[]>("/attendance/roster", { query: { batchId, date } }),
    enabled: !!batchId,
  });
  React.useEffect(() => {
    const m: Record<string, Status> = {};
    for (const r of roster.data ?? []) if (r.status) m[r.studentUserId] = r.status;
    setMarks(m);
  }, [roster.data]);
  const save = useMutation({
    mutationFn: () =>
      api<{ saved: number }>("/attendance", { method: "PUT", body: { batchId, date, records: Object.entries(marks).map(([studentUserId, status]) => ({ studentUserId, status })) } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["attendance-roster"] }),
  });
  const setAll = (s: Status) => setMarks(Object.fromEntries((roster.data ?? []).map((r) => [r.studentUserId, s])));
  const counts = STATUSES.map((s) => `${Object.values(marks).filter((v) => v === s).length} ${s}`).join(", ");
  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark class attendance for a batch. Absences notify the student and their parents." />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Batch">
            <select className={inputCls} value={batchId} onChange={(e) => setBatchId(e.target.value)} aria-label="Batch">
              {(batches.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" className={inputCls} value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          </Field>
          <Button variant="outline" onClick={() => setAll("present")}>Mark all present</Button>
        </div>
        {roster.isLoading ? <Loading /> : roster.error ? <ErrorNote error={roster.error} /> : !roster.data?.length ? (
          <EmptyState>No students are enrolled in this batch.</EmptyState>
        ) : (
          <>
            <Table head={["Roll", "Student", "Status"]}>
              {roster.data.map((r) => (
                <tr key={r.studentUserId}>
                  <Td>{r.rollNo ?? "-"}</Td>
                  <Td className="font-medium">{r.name}</Td>
                  <Td>
                    <div className="flex gap-1.5" role="radiogroup" aria-label={`Attendance for ${r.name}`}>
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={marks[r.studentUserId] === s}
                          onClick={() => setMarks((m) => ({ ...m, [r.studentUserId]: s }))}
                          className={`rounded-md border px-2.5 py-1 text-xs capitalize ${marks[r.studentUserId] === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <div className="flex items-center gap-4">
              <Button onClick={() => save.mutate()} disabled={save.isPending || !Object.keys(marks).length}>
                {save.isPending ? "Saving..." : "Save attendance"}
              </Button>
              <span className="text-xs text-muted-foreground">{counts}</span>
            </div>
            {save.isSuccess && <SuccessNote>Saved attendance for {save.data.saved} students.</SuccessNote>}
            {save.error && <ErrorNote error={save.error} />}
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------ attendance: parent ------------------------------ */
type Summary = { total: number; attended: number; present: number; late: number; absent: number; excused: number; percent: number | null; recent: { date: string; status: Status; batch: string }[] };

export function AttendanceSummaryView({ studentUserId }: { studentUserId?: string }) {
  const q = useQuery({ queryKey: ["attendance-summary", studentUserId ?? "self"], queryFn: () => api<Summary>("/attendance/summary", { query: { studentUserId } }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const s = q.data!;
  if (!s.total) return <EmptyState>No attendance has been recorded yet.</EmptyState>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Attendance", s.percent == null ? "-" : `${s.percent}%`], ["Present", s.present], ["Late", s.late], ["Absent", s.absent]].map(([l, v]) => (
          <div key={String(l)} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="mt-1 text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <Panel title="Recent days">
        <Table head={["Date", "Batch", "Status"]}>
          {s.recent.map((r, i) => (
            <tr key={i}>
              <Td>{r.date}</Td>
              <Td>{r.batch}</Td>
              <Td><Pill tone={tone(r.status)}>{r.status}</Pill></Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

export function ParentAttendancePage() {
  const { child, isLoading } = useSelectedChild();
  if (isLoading) return <Loading />;
  return (
    <>
      <PageHeader title="Attendance" subtitle={child ? `${child.name}'s class attendance.` : "Your child's class attendance."} />
      {child ? <AttendanceSummaryView studentUserId={child.userId} /> : <EmptyState>No child is linked to your account yet.</EmptyState>}
    </>
  );
}

