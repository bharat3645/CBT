import type { AnswerValue, AutosaveItem, PresetConfig, QuestionStatus } from "@cbt/contracts/exams";

export interface ExamQuestion {
  id: string;
  section: number;
  type: "mcq" | "multi" | "numeric";
  text: string;
  /** Rich content (Tiptap JSON with maths nodes); when present the exam renders it with KaTeX instead of `text`. */
  doc?: unknown;
  options: { id: string; text: string; doc?: unknown }[];
}

export type Phase = "loading" | "instructions" | "running" | "submitting" | "submitted" | "expired";
export type SaveState = "saved" | "saving" | "offline" | "error";

export interface AnswerState { status: QuestionStatus; value: AnswerValue; seq: number; timeSpentMs: number }

export interface ExamState {
  phase: Phase;
  attemptId: string | null;
  config: PresetConfig | null;
  questions: ExamQuestion[];
  sections: string[];
  current: number;
  furthest: number; // highest index reached, used for one_way navigation
  answers: Record<string, AnswerState>;
  seqCounter: number;
  outbox: AutosaveItem[]; // changes the sync layer must persist (Dexie) and send
  saveState: SaveState;
  sync: { remainingMs: number; at: number } | null; // server remaining at monotonic time `at`
  enteredAt: number; // monotonic ms when current question was shown
  receiptCode: string | null;
}

export const emptyValue = (): AnswerValue => ({ selected: [], numeric: null });

export const initialState: ExamState = {
  phase: "loading", attemptId: null, config: null, questions: [], sections: [], current: 0, furthest: 0,
  answers: {}, seqCounter: 0, outbox: [], saveState: "saved", sync: null, enteredAt: 0, receiptCode: null,
};

export type Action =
  | { type: "LOADED"; attemptId: string; config: PresetConfig; questions: ExamQuestion[]; sections: string[]; resumed: AutosaveItem[]; remainingMs: number; now: number }
  | { type: "START"; now: number }
  | { type: "GOTO"; index: number; now: number }
  | { type: "SELECT"; optionId: string }
  | { type: "SET_NUMERIC"; value: string }
  | { type: "CLEAR" }
  | { type: "SAVE_NEXT"; now: number }
  | { type: "MARK_NEXT"; now: number }
  | { type: "SERVER_SYNC"; remainingMs: number; now: number }
  | { type: "SAVE_STATE"; state: SaveState }
  | { type: "OUTBOX_DRAINED"; count: number }
  | { type: "SUBMIT_REQUESTED" }
  | { type: "SUBMITTED"; receiptCode: string }
  | { type: "SUBMIT_FAILED" }
  | { type: "EXPIRED" };

export const hasAnswer = (v: AnswerValue) => v.selected.length > 0 || (v.numeric !== null && v.numeric !== "");

/** Palette count helper. */
export function paletteCounts(s: ExamState) {
  const c: Record<QuestionStatus, number> = { not_visited: 0, not_answered: 0, answered: 0, marked: 0, answered_marked: 0 };
  for (const q of s.questions) c[s.answers[q.id]?.status ?? "not_visited"]++;
  return c;
}

export function remainingFromSync(sync: ExamState["sync"], now: number): number {
  if (!sync) return 0;
  return Math.max(0, sync.remainingMs - (now - sync.at));
}

export function canGoTo(s: ExamState, index: number): boolean {
  if (index < 0 || index >= s.questions.length) return false;
  if (s.config?.navigation === "one_way") return index >= s.furthest;
  return true;
}

function write(s: ExamState, qid: string, patch: Partial<AnswerState>, now: number): ExamState {
  const prev = s.answers[qid] ?? { status: "not_visited" as QuestionStatus, value: emptyValue(), seq: 0, timeSpentMs: 0 };
  const seq = s.seqCounter + 1;
  const next: AnswerState = { ...prev, ...patch, seq };
  const item: AutosaveItem = { questionId: qid, seq, status: next.status, value: next.value, timeSpentMs: next.timeSpentMs };
  return { ...s, answers: { ...s.answers, [qid]: next }, seqCounter: seq, outbox: [...s.outbox, item], saveState: "saving" };
}

/** Leaving a question: account time, and mark visited questions that have no answer as not_answered. */
function leave(s: ExamState, now: number): ExamState {
  const q = s.questions[s.current];
  if (!q) return s;
  const prev = s.answers[q.id];
  const spent = (prev?.timeSpentMs ?? 0) + Math.round(Math.max(0, now - s.enteredAt));
  const status = prev?.status ?? "not_answered";
  return write(s, q.id, { status: status === "not_visited" ? "not_answered" : status, timeSpentMs: spent }, now);
}

function visit(s: ExamState, index: number, now: number): ExamState {
  const q = s.questions[index];
  let st: ExamState = { ...s, current: index, furthest: Math.max(s.furthest, index), enteredAt: now };
  if (q && !st.answers[q.id]) st = write(st, q.id, { status: "not_answered" }, now);
  return st;
}

function move(s: ExamState, to: number, now: number): ExamState {
  if (!canGoTo(s, to)) return s;
  return visit(leave(s, now), to, now);
}

export function examReducer(s: ExamState, a: Action): ExamState {
  switch (a.type) {
    case "LOADED": {
      const answers: Record<string, AnswerState> = {};
      let seq = 0;
      for (const r of a.resumed) {
        answers[r.questionId] = { status: r.status, value: r.value, seq: r.seq, timeSpentMs: r.timeSpentMs };
        seq = Math.max(seq, r.seq);
      }
      return { ...initialState, phase: "instructions", attemptId: a.attemptId, config: a.config, questions: a.questions,
        sections: a.sections, answers, seqCounter: seq, sync: { remainingMs: a.remainingMs, at: a.now } };
    }
    case "START":
      if (s.phase !== "instructions") return s;
      return visit({ ...s, phase: "running" }, s.current, a.now);
    case "GOTO":
      return s.phase === "running" ? move(s, a.index, a.now) : s;
    case "SELECT": {
      if (s.phase !== "running") return s;
      const q = s.questions[s.current];
      const cur = s.answers[q.id];
      const multi = q.type === "multi";
      const selected = multi
        ? cur?.value.selected.includes(a.optionId) ? cur.value.selected.filter((x) => x !== a.optionId) : [...(cur?.value.selected ?? []), a.optionId]
        : [a.optionId];
      const marked = cur?.status === "marked" || cur?.status === "answered_marked";
      return write(s, q.id, { value: { selected, numeric: null }, status: marked ? "answered_marked" : "answered" }, 0);
    }
    case "SET_NUMERIC": {
      if (s.phase !== "running") return s;
      const q = s.questions[s.current];
      const marked = s.answers[q.id]?.status === "marked" || s.answers[q.id]?.status === "answered_marked";
      const filled = a.value !== "";
      return write(s, q.id, { value: { selected: [], numeric: filled ? a.value : null },
        status: filled ? (marked ? "answered_marked" : "answered") : (marked ? "marked" : "not_answered") }, 0);
    }
    case "CLEAR": {
      if (s.phase !== "running") return s;
      const q = s.questions[s.current];
      return write(s, q.id, { value: emptyValue(), status: "not_answered" }, 0);
    }
    case "SAVE_NEXT": {
      if (s.phase !== "running") return s;
      const q = s.questions[s.current];
      const ans = s.answers[q.id];
      const status: QuestionStatus = ans && hasAnswer(ans.value) ? "answered" : "not_answered";
      let st = write(s, q.id, { status }, a.now);
      return move({ ...st }, Math.min(s.current + 1, s.questions.length - 1), a.now);
    }
    case "MARK_NEXT": {
      if (s.phase !== "running") return s;
      const q = s.questions[s.current];
      const ans = s.answers[q.id];
      const status: QuestionStatus = ans && hasAnswer(ans.value) ? "answered_marked" : "marked";
      const st = write(s, q.id, { status }, a.now);
      return move(st, Math.min(s.current + 1, s.questions.length - 1), a.now);
    }
    case "SERVER_SYNC":
      return { ...s, sync: { remainingMs: a.remainingMs, at: a.now } };
    case "SAVE_STATE":
      return { ...s, saveState: a.state };
    case "OUTBOX_DRAINED":
      return { ...s, outbox: s.outbox.slice(a.count) };
    case "SUBMIT_REQUESTED":
      return s.phase === "running" ? { ...s, phase: "submitting" } : s;
    case "SUBMIT_FAILED":
      return s.phase === "submitting" ? { ...s, phase: "running" } : s;
    case "SUBMITTED":
      return { ...s, phase: "submitted", receiptCode: a.receiptCode };
    case "EXPIRED":
      return s.phase === "running" || s.phase === "submitting" ? { ...s, phase: "expired" } : s;
    default:
      return s;
  }
}
