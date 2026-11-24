"use client";
import type { QuestionStatus } from "@cbt/contracts/exams";
import type { RichDoc } from "@cbt/contracts";
import "katex/dist/katex.min.css";
import { RichTextView } from "@/features/question-bank/components/RichTextView";
import type { ExamQuestion, ExamState, SaveState } from "../lib/exam-machine";
import { paletteCounts } from "../lib/exam-machine";

export function formatClock(ms: number) {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

const STATUS_STYLE: Record<QuestionStatus, string> = {
  not_visited: "bg-slate-100 text-slate-700 border border-slate-300",
  not_answered: "bg-red-500 text-white rounded-b-xl",
  answered: "bg-green-500 text-white rounded-t-xl",
  marked: "bg-purple-600 text-white rounded-full",
  answered_marked: "bg-purple-600 text-white rounded-full ring-2 ring-green-400",
};
const STATUS_LABEL: Record<QuestionStatus, string> = {
  not_visited: "Not Visited", not_answered: "Not Answered", answered: "Answered",
  marked: "Marked for Review", answered_marked: "Answered & Marked for Review",
};

export function TopBar(p: { title: string; candidate: string; remainingMs: number; sections: string[]; activeSection: number; onSection: (i: number) => void }) {
  const low = p.remainingMs < 5 * 60_000;
  return (
    <header className="border-b bg-white">
      <div className="flex items-center justify-between px-4 py-2">
        <h1 className="text-base font-semibold">{p.title}</h1>
        <div className="flex items-center gap-4 text-sm">
          <span>{p.candidate}</span>
          <span role="timer" aria-live="off" className={`rounded px-3 py-1 font-mono text-lg ${low ? "bg-red-100 text-red-700" : "bg-slate-100"}`}>
            {formatClock(p.remainingMs)}
          </span>
        </div>
      </div>
      <nav className="flex gap-1 px-4" aria-label="Sections">
        {p.sections.map((s, i) => (
          <button key={s} onClick={() => p.onSection(i)} aria-current={i === p.activeSection}
            className={`rounded-t px-4 py-1.5 text-sm ${i === p.activeSection ? "bg-blue-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
            {s}
          </button>
        ))}
      </nav>
    </header>
  );
}

export function QuestionPane(p: { q: ExamQuestion; index: number; selected: string[]; numeric: string | null;
  onSelect: (id: string) => void; onNumeric: (v: string) => void }) {
  return (
    <section className="flex-1 overflow-y-auto p-6">
      <p className="mb-4 text-sm text-slate-500">Question {p.index + 1}</p>
      <div className="mb-6 whitespace-pre-wrap text-lg">{p.q.doc ? <RichTextView doc={p.q.doc as RichDoc} /> : p.q.text}</div>
      {p.q.type === "numeric" ? (
        <input inputMode="decimal" value={p.numeric ?? ""} onChange={(e) => p.onNumeric(e.target.value.replace(/[^0-9.\-]/g, ""))}
          className="w-64 rounded border px-3 py-2 text-lg" aria-label="Numerical answer" />
      ) : (
        <ul className="space-y-2">
          {p.q.options.map((o, i) => {
            const on = p.selected.includes(o.id);
            return (
              <li key={o.id}>
                <label className={`flex cursor-pointer items-start gap-3 rounded border p-3 ${on ? "border-blue-600 bg-blue-50" : "hover:bg-slate-50"}`}>
                  <input type={p.q.type === "multi" ? "checkbox" : "radio"} name="opt" checked={on} onChange={() => p.onSelect(o.id)} />
                  <span className="flex gap-1"><span>{String.fromCharCode(65 + i)}.</span>{o.doc ? <RichTextView doc={o.doc as RichDoc} /> : o.text}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Palette(p: { s: ExamState; onGoto: (i: number) => void; simple?: boolean }) {
  const counts = paletteCounts(p.s);
  const section = p.s.questions[p.s.current]?.section ?? 0;
  return (
    <aside className="flex w-72 flex-col border-l bg-white" aria-label="Question palette">
      <ul className="grid grid-cols-2 gap-1 p-3 text-xs">
        {(Object.keys(STATUS_LABEL) as QuestionStatus[]).filter((k) => !p.simple || k === "not_visited" || k === "answered" || k === "not_answered").map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className={`inline-flex h-6 w-6 items-center justify-center text-[11px] ${STATUS_STYLE[k]}`}>{counts[k]}</span>
            {STATUS_LABEL[k]}
          </li>
        ))}
      </ul>
      <div className="grid flex-1 grid-cols-5 content-start gap-2 overflow-y-auto border-t p-3">
        {p.s.questions.map((q, i) => q.section !== section ? null : (
          <button key={q.id} onClick={() => p.onGoto(i)} aria-label={`Question ${i + 1}: ${STATUS_LABEL[p.s.answers[q.id]?.status ?? "not_visited"]}`}
            className={`h-9 w-9 text-sm ${STATUS_STYLE[p.s.answers[q.id]?.status ?? "not_visited"]} ${i === p.s.current ? "outline outline-2 outline-blue-600" : ""}`}>
            {i + 1}
          </button>
        ))}
      </div>
    </aside>
  );
}

export function ActionBar(p: { onPrev: () => void; onSaveNext: () => void; onMarkNext: () => void; onClear: () => void; onSubmit: () => void;
  prevDisabled: boolean; saveState: SaveState; showPrev: boolean }) {
  return (
    <footer className="flex items-center justify-between border-t bg-white px-4 py-3">
      <div className="flex gap-2">
        <button onClick={p.onMarkNext} className="rounded border px-3 py-2 text-sm">Mark for Review &amp; Next</button>
        <button onClick={p.onClear} className="rounded border px-3 py-2 text-sm">Clear Response</button>
        {p.showPrev && <button onClick={p.onPrev} disabled={p.prevDisabled} className="rounded border px-3 py-2 text-sm disabled:opacity-40">Previous</button>}
        <button onClick={p.onSaveNext} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Save &amp; Next</button>
      </div>
      <div className="flex items-center gap-4">
        <SavedIndicator state={p.saveState} />
        <button onClick={p.onSubmit} className="rounded bg-green-600 px-4 py-2 text-sm text-white">Submit</button>
      </div>
    </footer>
  );
}

export function SavedIndicator({ state }: { state: SaveState }) {
  const map = {
    saved: ["bg-green-500", "All answers saved"],
    saving: ["bg-amber-400", "Saving..."],
    offline: ["bg-red-500", "Offline - answers queued on this device"],
    error: ["bg-red-500", "Save failed - retrying"],
  } as const;
  const [dot, text] = map[state];
  return (
    <span role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-slate-600">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />{text}
    </span>
  );
}
