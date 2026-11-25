"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants, Card, Input } from "@cbt/ui";
import { paperApi } from "@/features/paper-review";
import { TestWizard, type WizardBatch, type WizardPaper } from "@/features/cbt/components/test-wizard";
import { api } from "@/lib/api-client";

/** Approved papers become wizard papers. Sections come from each draft's section heading; ids are the question-bank ids created on approval. */
async function loadApprovedPapers(): Promise<WizardPaper[]> {
  const list = (await paperApi.list()).filter((p) => p.status === "approved");
  return Promise.all(
    list.map(async (p) => {
      const d = await paperApi.get(p.id);
      const by = new Map<string, string[]>();
      for (const q of [...d.drafts].sort((a, b) => a.ordinal - b.ordinal)) {
        if (!q.questionId) continue;
        const k = q.section ?? "General";
        by.set(k, [...(by.get(k) ?? []), q.questionId]);
      }
      return { id: p.id, title: p.title || p.filename, sections: [...by].map(([name, questionIds]) => ({ name, questionIds })) };
    }),
  );
}

/* ---------- API shapes (GET /api/v1/tests and /api/v1/tests/upcoming) ---------- */
type WindowState = "scheduled" | "open" | "closed";
export interface StaffTest {
  id: string; title: string; status: string; presetKey: string; presetName: string; durationMinutes: number;
  windowStart: string; windowEnd: string; windowState: WindowState; batchIds: string[]; batches: { id: string; name: string }[];
  questionCount: number; attemptCount: number; submittedCount: number;
}
export interface UpcomingTest {
  id: string; title: string; presetKey: string; presetName: string; durationMinutes: number; questionCount: number;
  windowStart: string; windowEnd: string; windowState: WindowState;
  attemptState: "not_started" | "in_progress" | "submitted"; attemptId: string | null; resultAvailable: boolean; canStart: boolean;
}

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const STATE_LABEL: Record<WindowState, string> = { scheduled: "Scheduled", open: "Open now", closed: "Closed" };

/** Teacher and admin: create + publish a test for batches, with the institute's existing tests listed below. */
export function TestsPage() {
  const qc = useQueryClient();
  const base = usePathname().replace(/\/$/, "");
  const papers = useQuery({ queryKey: ["wizard-papers"], queryFn: loadApprovedPapers });
  const batches = useQuery({ queryKey: ["wizard-batches"], queryFn: () => api<WizardBatch[]>("/batches") });
  const tests = useQuery({ queryKey: ["tests"], queryFn: () => api<StaffTest[]>("/tests") });
  const [done, setDone] = useState<{ id: string; title: string } | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Tests</h1>
      {done && (
        <p role="status" className="text-sm text-green-700">
          Test &quot;{done.title}&quot; created and published. Test id: <code data-testid="created-test-id">{done.id}</code>
        </p>
      )}
      {papers.isLoading || batches.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : papers.error ? (
        <p role="alert" className="text-sm">Could not load approved papers.</p>
      ) : !papers.data?.length ? (
        <p className="text-sm text-muted-foreground">Approve a paper first to create a test.</p>
      ) : (
        <TestWizard
          papers={papers.data}
          batches={batches.data ?? []}
          onDone={(id, title) => { setDone({ id, title }); void qc.invalidateQueries({ queryKey: ["tests"] }); }}
        />
      )}
      <section aria-label="Existing tests" className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight">Existing tests</h2>
        {tests.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : tests.error ? (
          <p role="alert" className="text-sm">Could not load tests.</p>
        ) : !tests.data?.length ? (
          <p className="text-sm text-muted-foreground">No tests yet.</p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Test</th><th className="p-2">Batches</th><th className="p-2">Status</th>
                  <th className="p-2">Window</th><th className="p-2">Preset</th><th className="p-2 text-right">Attempts</th><th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {tests.data.map((t) => (
                  <tr key={t.id} data-testid="test-row">
                    <td className="p-2 font-medium">{t.title}<div className="text-xs font-normal text-muted-foreground">{t.questionCount} questions, {t.durationMinutes} min</div></td>
                    <td className="p-2">{t.batches.length ? t.batches.map((b) => b.name).join(", ") : "Whole institute"}</td>
                    <td className="p-2">{t.status === "published" ? STATE_LABEL[t.windowState] : t.status === "closed" ? "Cancelled" : t.status}</td>
                    <td className="p-2 whitespace-nowrap">{fmt(t.windowStart)}<br />{fmt(t.windowEnd)}</td>
                    <td className="p-2">{t.presetName}</td>
                    <td className="p-2 text-right">{t.submittedCount} / {t.attemptCount}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Link className="text-primary underline" href={`${base}/${t.id}/leaderboard`}>Leaderboard</Link>
                      {t.status !== "closed" && <TestRowActions t={t} onChanged={() => void qc.invalidateQueries({ queryKey: ["tests"] })} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Edit (title / window) and cancel for one test row. Cancelling hides it from students; results already earned stay. */
function TestRowActions({ t, onChanged }: { t: StaffTest; onChanged: () => void }) {
  const [mode, setMode] = useState<"idle" | "edit" | "cancel">("idle");
  const [title, setTitle] = useState(t.title);
  const [start, setStart] = useState(toLocalInput(t.windowStart));
  const [end, setEnd] = useState(toLocalInput(t.windowEnd));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMode("idle"); onChanged(); setMsg(ok); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-2 space-y-2 text-left">
      {mode === "idle" && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode("edit")}>Edit</Button>
          <Button size="sm" variant="outline" onClick={() => setMode("cancel")}>Cancel test</Button>
        </div>
      )}
      {mode === "edit" && (
        <form
          className="space-y-2 rounded border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api(`/tests/${t.id}`, { method: "PATCH", body: { title, windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString() } }), "Test updated.");
          }}
        >
          <label className="block text-xs">Title<Input aria-label={`Title for ${t.title}`} value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
          <label className="block text-xs">Opens<Input aria-label="Window start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
          <label className="block text-xs">Closes<Input aria-label="Window end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy}>Save test</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setMode("idle")}>Close</Button>
          </div>
        </form>
      )}
      {mode === "cancel" && (
        <div className="space-y-2 rounded border p-2 text-xs">
          <p>Cancel &quot;{t.title}&quot;? Students will no longer see or start it. Submitted attempts and results are kept.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void run(() => api(`/tests/${t.id}/cancel`, { method: "POST" }), "Test cancelled.")}>Yes, cancel test</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>Keep test</Button>
          </div>
        </div>
      )}
      {msg && <p role="status" className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

function UpcomingCard({ t }: { t: UpcomingTest }) {
  const action =
    t.resultAvailable && t.attemptId ? (
      <Link className={buttonVariants({ variant: "outline" })} href={`/student/tests/results/${t.attemptId}`}>View result</Link>
    ) : t.attemptState === "submitted" ? (
      <span className="text-sm text-muted-foreground">Submitted. Result pending.</span>
    ) : t.canStart && t.attemptState === "in_progress" ? (
      <Link className={buttonVariants()} href={`/exam/${t.id}`}>Resume</Link>
    ) : t.canStart ? (
      <Link className={buttonVariants()} href={`/exam/${t.id}`}>Start test</Link>
    ) : t.windowState === "scheduled" ? (
      <span className="text-sm text-muted-foreground">Opens {fmt(t.windowStart)}</span>
    ) : (
      <span className="text-sm text-muted-foreground">Window closed</span>
    );
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid="upcoming-test">
      <div className="space-y-1">
        <h3 className="font-medium">{t.title}</h3>
        <p className="text-xs text-muted-foreground">
          {t.presetName} &middot; {t.durationMinutes} min &middot; {t.questionCount} questions
        </p>
        <p className="text-xs text-muted-foreground">{fmt(t.windowStart)} to {fmt(t.windowEnd)} &middot; {STATE_LABEL[t.windowState]}</p>
      </div>
      {action}
    </Card>
  );
}

/** Student: published tests for the student's batches with Start / Resume / View result. */
export function UpcomingTestsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["tests-upcoming"], queryFn: () => api<UpcomingTest[]>("/tests/upcoming") });
  const todo = (data ?? []).filter((t) => t.attemptState !== "submitted");
  const finished = (data ?? []).filter((t) => t.attemptState === "submitted");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Upcoming tests</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p role="alert" className="text-sm">Could not load your tests.</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">No tests are scheduled for your batches yet.</p>
      ) : (
        <>
          <div className="space-y-3">
            {todo.length ? todo.map((t) => <UpcomingCard key={t.id} t={t} />) : <p className="text-sm text-muted-foreground">Nothing left to take right now.</p>}
          </div>
          {finished.length > 0 && (
            <section aria-label="Completed tests" className="space-y-3">
              <h2 className="text-base font-semibold tracking-tight">Completed</h2>
              {finished.map((t) => <UpcomingCard key={t.id} t={t} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
