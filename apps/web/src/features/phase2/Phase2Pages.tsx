"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cbt/ui";
import type { RichDoc } from "@cbt/contracts";
import { api } from "@/lib/api-client";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Field, Loading, Panel, Pill, SuccessNote, Table, Td, fmtDateTime, inputCls } from "@/components/ui-kit";
import { useBatches } from "@/features/people/api";
import { useSelectedChild } from "@/features/parent/child";
import { useNotifications } from "@/features/notifications/api";
import { RichTextView } from "@/features/question-bank/components/RichTextView";

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
  const counts = STATUSES.map((s) => `${Object.values(marks).filter((v) => v === s).length} ${s}`).join(" · ");
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

/* ------------------------------ feedback ------------------------------ */
type FeedbackRow = { id: string; authorName: string; body: string; createdAt: string };

export function FeedbackList({ studentUserId }: { studentUserId?: string }) {
  const q = useQuery({ queryKey: ["feedback", studentUserId ?? "self"], queryFn: () => api<FeedbackRow[]>("/feedback", { query: { studentUserId } }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data?.length) return <EmptyState>No teacher feedback yet.</EmptyState>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {q.data.map((f) => (
        <li key={f.id} className="px-4 py-3">
          <div className="flex justify-between gap-4 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{f.authorName}</span>
            <span>{fmtDateTime(f.createdAt)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{f.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function TeacherFeedbackPage() {
  const qc = useQueryClient();
  const students = useQuery({ queryKey: ["feedback-students"], queryFn: () => api<{ studentUserId: string; name: string; rollNo: string | null }[]>("/feedback/students") });
  const [sid, setSid] = React.useState("");
  const [body, setBody] = React.useState("");
  React.useEffect(() => {
    if (!sid && students.data?.length) setSid(students.data[0]!.studentUserId);
  }, [students.data, sid]);
  const send = useMutation({
    mutationFn: () => api("/feedback", { method: "POST", body: { studentUserId: sid, body } }),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["feedback"] });
    },
  });
  return (
    <>
      <PageHeader title="Feedback" subtitle="Write feedback for a student. The student and their linked parents are notified." />
      <div className="space-y-6">
        <Panel title="New feedback">
          <div className="space-y-3">
            <Field label="Student">
              <select className={inputCls} value={sid} onChange={(e) => setSid(e.target.value)} aria-label="Student">
                {(students.data ?? []).map((s) => (
                  <option key={s.studentUserId} value={s.studentUserId}>
                    {s.name}
                    {s.rollNo ? ` (${s.rollNo})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Feedback">
              <textarea className={inputCls} rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Strengths, what to work on, next steps..." aria-label="Feedback" />
            </Field>
            <Button onClick={() => send.mutate()} disabled={send.isPending || body.trim().length < 3 || !sid}>
              {send.isPending ? "Sending..." : "Send feedback"}
            </Button>
            {send.isSuccess && <SuccessNote>Feedback sent.</SuccessNote>}
            {send.error && <ErrorNote error={send.error} />}
          </div>
        </Panel>
        {sid && (
          <Panel title="Previous feedback for this student">
            <FeedbackList studentUserId={sid} />
          </Panel>
        )}
      </div>
    </>
  );
}

export function ParentFeedbackPage2() {
  const { child, isLoading } = useSelectedChild();
  const notes = useNotifications({ limit: 30 });
  if (isLoading) return <Loading />;
  return (
    <>
      <PageHeader title="Feedback and updates" subtitle="Teacher feedback and messages from your institute." />
      <div className="space-y-6">
        <Panel title={child ? `Teacher feedback for ${child.name}` : "Teacher feedback"}>
          {child ? <FeedbackList studentUserId={child.userId} /> : <EmptyState>No child is linked to your account yet.</EmptyState>}
        </Panel>
        <Panel title="Notices">
          {!notes.data?.length ? (
            <EmptyState>No updates yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {notes.data.map((n) => (
                <li key={n.id} className="flex justify-between gap-4 py-2.5">
                  <div>
                    <div className={n.readAt ? "text-sm text-muted-foreground" : "text-sm font-medium"}>{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

/* ------------------------------ practice ------------------------------ */
type PQ = { id: string; code: string; difficulty: string; type: string; stem: RichDoc; options: { id: string; content: RichDoc }[] | null; multi: boolean };
type Check = { correct: boolean; correctAnswer: unknown; explanation: RichDoc | null };

function PracticeCard({ q, index, onDone }: { q: PQ; index: number; onDone: (ok: boolean) => void }) {
  const [sel, setSel] = React.useState<string[]>([]);
  const [text, setText] = React.useState("");
  const check = useMutation({
    mutationFn: () => api<Check>("/practice/check", { method: "POST", body: { questionId: q.id, answer: q.options ? (q.multi ? sel : sel[0] ?? "") : text } }),
    onSuccess: (r) => onDone(r.correct),
  });
  const done = check.data;
  const ready = q.options ? sel.length > 0 : text.trim() !== "";
  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="practice-question">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Q{index + 1}</span> <Pill>{q.difficulty}</Pill> {q.multi && <span>Select all that apply</span>}
      </div>
      <div className="prose prose-sm max-w-none"><RichTextView doc={q.stem} /></div>
      {q.options ? (
        <div className="mt-3 space-y-2">
          {q.options.map((o) => {
            const correctIds = Array.isArray(done?.correctAnswer) ? (done!.correctAnswer as string[]) : [];
            const mark = done ? (correctIds.includes(o.id) ? "border-green-600 bg-green-50 dark:bg-green-950" : sel.includes(o.id) ? "border-red-500 bg-red-50 dark:bg-red-950" : "border-border") : sel.includes(o.id) ? "border-primary bg-muted" : "border-border hover:bg-muted";
            return (
              <button key={o.id} type="button" disabled={!!done} aria-pressed={sel.includes(o.id)} onClick={() => setSel((s) => (q.multi ? (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]) : [o.id]))} className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm ${mark}`}>
                <span className="font-semibold">{o.id}.</span>
                <RichTextView doc={o.content} />
              </button>
            );
          })}
        </div>
      ) : (
        <input className={`${inputCls} mt-3 max-w-xs`} inputMode="decimal" placeholder="Your numeric answer" value={text} disabled={!!done} onChange={(e) => setText(e.target.value)} aria-label="Numeric answer" />
      )}
      {!done && (
        <Button className="mt-3" onClick={() => check.mutate()} disabled={!ready || check.isPending}>
          Check answer
        </Button>
      )}
      {check.error && <ErrorNote error={check.error} />}
      {done && (
        <div className="mt-3 space-y-2 text-sm">
          <Pill tone={done.correct ? "good" : "bad"}>{done.correct ? "Correct" : `Incorrect. Answer: ${Array.isArray(done.correctAnswer) ? (done.correctAnswer as string[]).join(", ") : String(done.correctAnswer)}`}</Pill>
          {done.explanation && (
            <div className="rounded-md bg-muted p-3">
              <div className="mb-1 text-xs font-semibold">Explanation</div>
              <RichTextView doc={done.explanation} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PracticeSetsPage() {
  const topics = useQuery({ queryKey: ["practice-topics"], queryFn: () => api<{ id: string; name: string; count: number }[]>("/practice/topics") });
  const stats = useQuery({ queryKey: ["practice-stats"], queryFn: () => api<{ attempted: number; correct: number }>("/practice/stats") });
  const qc = useQueryClient();
  const [topicId, setTopicId] = React.useState("");
  const [count, setCount] = React.useState(5);
  const [run, setRun] = React.useState(0);
  const [results, setResults] = React.useState<Record<string, boolean>>({});
  const set = useQuery({
    queryKey: ["practice-set", topicId, count, run],
    queryFn: () => api<PQ[]>("/practice/set", { query: { topicId: topicId || undefined, count } }),
    enabled: run > 0,
    staleTime: Infinity,
  });
  const answered = Object.keys(results).length;
  const right = Object.values(results).filter(Boolean).length;
  return (
    <>
      <PageHeader title="Practice" subtitle="Self-paced practice by topic. Answers are checked on the server, so the answer key is never sent to your browser in advance." />
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Topic">
            <select className={inputCls} value={topicId} onChange={(e) => setTopicId(e.target.value)} aria-label="Topic">
              <option value="">Any topic</option>
              {(topics.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.count})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Questions">
            <select className={inputCls} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Question count">
              {[3, 5, 10].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Button
            onClick={() => {
              setResults({});
              setRun((r) => r + 1);
            }}
          >
            {run ? "New set" : "Start practice"}
          </Button>
          {stats.data && stats.data.attempted > 0 && (
            <span className="pb-2 text-xs text-muted-foreground">
              All time: {stats.data.correct} / {stats.data.attempted} correct
            </span>
          )}
        </div>
        {run === 0 ? (
          <EmptyState>Pick a topic and start a set.</EmptyState>
        ) : set.isLoading ? (
          <Loading />
        ) : set.error ? (
          <ErrorNote error={set.error} />
        ) : !set.data?.length ? (
          <EmptyState>No practice questions are available for this topic yet.</EmptyState>
        ) : (
          <>
            <div className="text-sm text-muted-foreground" data-testid="practice-score">
              {answered} of {set.data.length} answered · {right} correct
            </div>
            {set.data.map((q, i) => (
              <PracticeCard
                key={`${run}-${q.id}`}
                q={q}
                index={i}
                onDone={(ok) => {
                  setResults((r) => ({ ...r, [q.id]: ok }));
                  void qc.invalidateQueries({ queryKey: ["practice-stats"] });
                }}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}
