"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AutosaveItem, IncidentInput, SubmitReceipt } from "@cbt/contracts/exams";
import { useExamStore } from "../lib/exam-store";
import { remainingFromSync, type ExamQuestion } from "../lib/exam-machine";
import { enqueue, flush } from "../lib/outbox";
import { requestFullscreen, useStrictMode } from "../lib/use-strict-mode";
import { api } from "@/lib/api-client";
import { ActionBar, Palette, QuestionPane, TopBar } from "./exam-parts";

const post = <T = any,>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });

/**
 * Full-screen live exam. No sidebar. The question content is fetched from
 * GET /api/v1/attempts/:id/questions (M4 integration point) unless `loadQuestions` is passed.
 */
export function ExamScreen(props: {
  testId: string; candidate: string;
  loadQuestions?: (attemptId: string, sections: { name: string; questionIds: string[] }[]) => Promise<ExamQuestion[]>;
}) {
  const s = useExamStore();
  const { dispatch } = s;
  const [now, setNow] = useState(() => performance.now());
  const [title, setTitle] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [palOpen, setPalOpen] = useState(false);
  const sendRef = useRef<(a: string, items: AutosaveItem[]) => Promise<{ serverRemainingMs: number }>>(
    (a, items) => post(`/attempts/${a}/answers`, { items }));

  // Load / resume
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await post(`/tests/${props.testId}/attempts`);
        const secs: { name: string; questionIds: string[] }[] = r.sections;
        const qs = props.loadQuestions
          ? await props.loadQuestions(r.attemptId, secs)
          : await api<ExamQuestion[]>(`/attempts/${r.attemptId}/questions`);
        if (dead) return;
        setTitle(r.title);
        dispatch({ type: "LOADED", attemptId: r.attemptId, config: r.config, questions: qs, sections: secs.map((x) => x.name),
          resumed: r.resumedAnswers, remainingMs: r.remainingMs, now: performance.now() });
      } catch (e: any) { setError(e?.status === 409 ? "This attempt is already submitted." : "Could not load the test."); }
    })();
    return () => { dead = true; };
  }, [props.testId]);

  // 1s display tick; countdown derived from last server sync (monotonic clock)
  useEffect(() => { const t = setInterval(() => setNow(performance.now()), 1000); return () => clearInterval(t); }, []);
  const remaining = remainingFromSync(s.sync, now);

  const doFlush = useCallback(async () => {
    if (!s.attemptId) return;
    try {
      const n = await flush(s.attemptId, sendRef.current, (ms) => dispatch({ type: "SERVER_SYNC", remainingMs: ms, now: performance.now() }));
      dispatch({ type: "SAVE_STATE", state: "saved" });
      return n;
    } catch (e: any) {
      if (e?.status === 409) dispatch({ type: "EXPIRED" });
      else dispatch({ type: "SAVE_STATE", state: navigator.onLine ? "error" : "offline" });
    }
  }, [s.attemptId, dispatch]);

  // Persist outbox to Dexie, then flush (debounced). Periodic flush doubles as server time re-sync.
  useEffect(() => {
    if (!s.attemptId || s.outbox.length === 0) return;
    const items = s.outbox; const count = items.length;
    enqueue(s.attemptId, items).then(() => dispatch({ type: "OUTBOX_DRAINED", count }));
  }, [s.outbox, s.attemptId, dispatch]);
  useEffect(() => { if (s.saveState === "saving") { const t = setTimeout(doFlush, 600); return () => clearTimeout(t); } }, [s.saveState, s.seqCounter, doFlush]);
  useEffect(() => { const t = setInterval(doFlush, 15_000); const on = () => doFlush(); window.addEventListener("online", on);
    return () => { clearInterval(t); window.removeEventListener("online", on); }; }, [doFlush]);

  // Server says time is up (or local countdown hit zero): finish with the server receipt
  const submit = useCallback(async () => {
    if (!s.attemptId) return;
    dispatch({ type: "SUBMIT_REQUESTED" });
    try {
      await doFlush();
      const r: SubmitReceipt = await post(`/attempts/${s.attemptId}/submit`);
      dispatch({ type: "SUBMITTED", receiptCode: r.receiptCode });
    } catch { dispatch({ type: "SUBMIT_FAILED" }); setError("Submit failed, check your connection and retry."); }
  }, [s.attemptId, doFlush, dispatch]);
  useEffect(() => { if (s.phase === "running" && s.sync && remaining <= 0) submit(); }, [remaining, s.phase]);

  // Strict mode
  const level = s.config?.strictLevel ?? "off";
  useStrictMode({ enabled: s.phase === "running", level, onIncident: (i: IncidentInput) => {
    setWarn("Leaving the exam window is recorded and may flag your attempt.");
    if (s.attemptId) post(`/attempts/${s.attemptId}/incidents`, i).catch(() => {});
  } });

  if (error && s.phase === "loading") return <Centered>{error}</Centered>;
  if (s.phase === "loading") return <Centered>Loading test...</Centered>;
  if (s.phase === "instructions") return (
    <Centered>
      <h1 className="mb-2 text-xl font-semibold">{title}</h1>
      <p className="mb-4 max-w-md text-sm text-muted-foreground">
        The timer runs on the server and continues if you lose connection. Answers save automatically.
        {level !== "off" && " This test is monitored: switching tabs or leaving full screen is logged."}
      </p>
      <button className="rounded bg-primary px-6 py-2 text-primary-foreground" onClick={() => { if (level !== "off") requestFullscreen(); dispatch({ type: "START", now: performance.now() }); }}>
        Start test
      </button>
    </Centered>
  );
  if (s.phase === "submitted") return (
    <Centered>
      <h1 className="text-xl font-semibold">Test submitted</h1>
      <p className="mt-2">Receipt code: <code className="font-mono">{s.receiptCode}</code></p>
      <p className="mt-1 text-sm text-muted-foreground">Your answers are saved. Results appear once your teacher releases them.</p>
      <div className="mt-4 flex justify-center gap-3">
        {s.attemptId && <a className="btn-ink rounded-lg px-4 py-2 text-sm font-semibold" href={`/student/tests/results/${s.attemptId}`}>View result</a>}
        <a className="rounded-md border border-input bg-card px-4 py-2 text-sm" href="/student">Back to dashboard</a>
      </div>
    </Centered>
  );
  if (s.phase === "expired") return <Centered><h1 className="text-xl font-semibold">Time is up</h1><p>Your answers were submitted automatically.</p></Centered>;

  const q = s.questions[s.current];
  const a = s.answers[q.id];
  const oneWay = s.config?.navigation === "one_way";
  return (
    <div className="fixed inset-0 flex flex-col bg-muted">
      <TopBar onPalette={() => setPalOpen(true)} title={title} candidate={props.candidate} remainingMs={remaining} sections={s.sections} activeSection={q.section}
        onSection={(i) => { const idx = s.questions.findIndex((x) => x.section === i); if (idx >= 0) dispatch({ type: "GOTO", index: idx, now: performance.now() }); }} />
      {warn && <div role="alert" className="bg-exam-flagged/25 px-4 py-1 text-sm text-foreground" onClick={() => setWarn(null)}>{warn}</div>}
      {error && <div role="alert" className="bg-destructive/10 px-4 py-1 text-sm text-destructive" onClick={() => setError(null)}>{error}</div>}
      <div className="flex min-h-0 flex-1">
        <QuestionPane q={q} index={s.current} selected={a?.value.selected ?? []} numeric={a?.value.numeric ?? null}
          onSelect={(id) => dispatch({ type: "SELECT", optionId: id })} onNumeric={(v) => dispatch({ type: "SET_NUMERIC", value: v })} />
        <Palette open={palOpen} onClose={() => setPalOpen(false)} s={s} simple={s.config?.palette === "simple"} onGoto={(i) => dispatch({ type: "GOTO", index: i, now: performance.now() })} />
      </div>
      <ActionBar saveState={s.saveState} showPrev={!oneWay} prevDisabled={s.current === 0}
        onPrev={() => dispatch({ type: "GOTO", index: s.current - 1, now: performance.now() })}
        onSaveNext={() => dispatch({ type: "SAVE_NEXT", now: performance.now() })}
        onMarkNext={() => dispatch({ type: "MARK_NEXT", now: performance.now() })}
        onClear={() => dispatch({ type: "CLEAR" })}
        onSubmit={() => { if (confirm("Submit the test now? You cannot change answers afterwards.")) submit(); }} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 flex flex-col items-center justify-center bg-muted p-6 text-center">{children}</div>;
}
