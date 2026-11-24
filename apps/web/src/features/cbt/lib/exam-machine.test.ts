import { describe, it, expect } from "vitest";
import { DEFAULT_PRESETS } from "@cbt/contracts/exams";
import { examReducer, initialState, paletteCounts, remainingFromSync, canGoTo, type ExamQuestion, type ExamState } from "./exam-machine";
import { coalesce } from "./outbox";

const qs: ExamQuestion[] = [0, 1, 2].map((i) => ({
  id: `q${i}`, section: 0, type: "mcq", text: `Q${i}`, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
}));

function running(nav: "free" | "one_way" = "free"): ExamState {
  const config = { ...DEFAULT_PRESETS.nta.config, navigation: nav };
  let s = examReducer(initialState, { type: "LOADED", attemptId: "att", config, questions: qs, sections: ["S"], resumed: [], remainingMs: 60_000, now: 0 });
  return examReducer(s, { type: "START", now: 0 });
}

describe("exam state machine", () => {
  it("loading -> instructions -> running, first question becomes not_answered", () => {
    const s = running();
    expect(s.phase).toBe("running");
    expect(s.answers.q0.status).toBe("not_answered");
    expect(paletteCounts(s).not_visited).toBe(2);
  });
  it("select + save&next => answered, moves on, visits next", () => {
    let s = running();
    s = examReducer(s, { type: "SELECT", optionId: "a" });
    s = examReducer(s, { type: "SAVE_NEXT", now: 100 });
    expect(s.answers.q0.status).toBe("answered");
    expect(s.current).toBe(1);
    expect(s.answers.q1.status).toBe("not_answered");
  });
  it("mark for review keeps answer state distinct", () => {
    let s = running();
    s = examReducer(s, { type: "MARK_NEXT", now: 10 });
    expect(s.answers.q0.status).toBe("marked");
    s = examReducer(s, { type: "SELECT", optionId: "b" });
    s = examReducer(s, { type: "MARK_NEXT", now: 20 });
    expect(s.answers.q1.status).toBe("answered_marked");
  });
  it("clear response resets to not_answered", () => {
    let s = running();
    s = examReducer(s, { type: "SELECT", optionId: "a" });
    s = examReducer(s, { type: "CLEAR" });
    expect(s.answers.q0.status).toBe("not_answered");
    expect(s.answers.q0.value.selected).toEqual([]);
  });
  it("every mutation yields a strictly increasing seq and an outbox entry", () => {
    let s = running();
    s = examReducer(s, { type: "SELECT", optionId: "a" });
    s = examReducer(s, { type: "SAVE_NEXT", now: 5 });
    const seqs = s.outbox.map((o) => o.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(s.saveState).toBe("saving");
    s = examReducer(s, { type: "OUTBOX_DRAINED", count: s.outbox.length });
    expect(s.outbox).toHaveLength(0);
  });
  it("one_way navigation blocks going back", () => {
    let s = running("one_way");
    s = examReducer(s, { type: "SAVE_NEXT", now: 1 });
    expect(canGoTo(s, 0)).toBe(false);
    s = examReducer(s, { type: "GOTO", index: 0, now: 2 });
    expect(s.current).toBe(1);
  });
  it("resume continues sequence numbers after the highest stored seq", () => {
    const config = DEFAULT_PRESETS.nta.config;
    let s = examReducer(initialState, { type: "LOADED", attemptId: "a", config, questions: qs, sections: ["S"], remainingMs: 1, now: 0,
      resumed: [{ questionId: "q0", seq: 9, status: "answered", value: { selected: ["a"], numeric: null }, timeSpentMs: 0 }] });
    s = examReducer(s, { type: "START", now: 0 });
    expect(s.seqCounter).toBe(9);
    s = examReducer(s, { type: "SELECT", optionId: "b" });
    expect(s.seqCounter).toBeGreaterThan(9);
    expect(s.answers.q0.status).toBe("answered");
  });
  it("submit flow and expiry; edits ignored after submit", () => {
    let s = running();
    s = examReducer(s, { type: "SUBMIT_REQUESTED" });
    expect(s.phase).toBe("submitting");
    s = examReducer(s, { type: "SUBMIT_FAILED" });
    expect(s.phase).toBe("running");
    s = examReducer(s, { type: "EXPIRED" });
    expect(s.phase).toBe("expired");
    const before = s.seqCounter;
    s = examReducer(s, { type: "SELECT", optionId: "a" });
    expect(s.seqCounter).toBe(before);
    s = examReducer(s, { type: "SUBMITTED", receiptCode: "ABC" });
    expect(s.phase).toBe("submitted");
  });
});

describe("client countdown", () => {
  it("counts down from the last server sync using monotonic time", () => {
    expect(remainingFromSync({ remainingMs: 10_000, at: 1000 }, 4000)).toBe(7000);
    expect(remainingFromSync({ remainingMs: 10_000, at: 1000 }, 99_000)).toBe(0);
  });
  it("re-sync corrects drift", () => {
    let s = running();
    s = examReducer(s, { type: "SERVER_SYNC", remainingMs: 5000, now: 2000 });
    expect(remainingFromSync(s.sync, 3000)).toBe(4000);
  });
});

describe("offline outbox coalescing", () => {
  it("keeps only highest seq per question", () => {
    const mk = (q: string, seq: number) => ({ questionId: q, seq, status: "answered" as const, value: { selected: [], numeric: null }, timeSpentMs: 0 });
    const out = coalesce([mk("a", 1), mk("a", 3), mk("b", 2), mk("a", 2)]);
    expect(out.map((o) => [o.questionId, o.seq])).toEqual([["b", 2], ["a", 3]]);
  });
});

describe("autosave payload", () => {
  it("timeSpentMs is always an integer (the API schema rejects floats)", () => {
    const config = DEFAULT_PRESETS.nta.config;
    let s = examReducer(initialState, { type: "LOADED", attemptId: "a", config, questions: qs, sections: ["S"], remainingMs: 1e6, now: 0, resumed: [] });
    s = examReducer(s, { type: "START", now: 0.4 });
    s = examReducer(s, { type: "SELECT", optionId: "a" });
    s = examReducer(s, { type: "SAVE_NEXT", now: 1234.567 });
    expect(s.outbox.length).toBeGreaterThan(0);
    for (const item of s.outbox) expect(Number.isInteger(item.timeSpentMs)).toBe(true);
  });
});
