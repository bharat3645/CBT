"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cbt/ui";
import type { RichDoc } from "@cbt/contracts";
import { api } from "@/lib/api-client";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Field, Loading, Pill, inputCls } from "@/components/ui-kit";
import { RichTextView } from "@/features/question-bank/components/rich-text-view";

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
