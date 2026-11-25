"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cbt/ui";
import { api } from "@/lib/api-client";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Field, Loading, Panel, SuccessNote, fmtDateTime, inputCls } from "@/components/ui-kit";
import { useSelectedChild } from "@/features/parent/child";
import { useNotifications } from "@/features/notifications/api";

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

export function ParentFeedbackPage() {
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

