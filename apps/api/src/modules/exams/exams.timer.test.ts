import { describe, it, expect } from "vitest";
import { computeDeadline, remainingMs, isExpired, shouldApplyAnswer, SUBMIT_GRACE_MS, autosaveItem } from "@cbt/contracts/exams";
import { makeReceiptCode } from "./exams.service";

describe("server timer", () => {
  const start = new Date("2026-01-01T10:00:00Z");
  it("deadline is start + duration", () => {
    expect(computeDeadline(start, 180).toISOString()).toBe("2026-01-01T13:00:00.000Z");
  });
  it("is capped by window end (late starters)", () => {
    const end = new Date("2026-01-01T10:30:00Z");
    expect(computeDeadline(start, 180, end).toISOString()).toBe(end.toISOString());
  });
  it("remaining never negative", () => {
    const d = computeDeadline(start, 1);
    expect(remainingMs(d, new Date("2026-01-01T10:00:30Z"))).toBe(30_000);
    expect(remainingMs(d, new Date("2026-01-01T11:00:00Z"))).toBe(0);
  });
  it("grace window allows in-flight saves", () => {
    const d = computeDeadline(start, 1);
    expect(isExpired(d, new Date(d.getTime() + 1000), SUBMIT_GRACE_MS)).toBe(false);
    expect(isExpired(d, new Date(d.getTime() + SUBMIT_GRACE_MS + 1), SUBMIT_GRACE_MS)).toBe(true);
  });
  it("receipt code is deterministic", () => {
    const t = new Date("2026-01-01T10:00:00Z");
    expect(makeReceiptCode("a", t)).toBe(makeReceiptCode("a", t));
    expect(makeReceiptCode("a", t)).not.toBe(makeReceiptCode("b", t));
  });
});

describe("autosave idempotency", () => {
  it("applies only strictly newer sequence numbers", () => {
    expect(shouldApplyAnswer(undefined, 0)).toBe(true);
    expect(shouldApplyAnswer({ seq: 5 }, 5)).toBe(false);
    expect(shouldApplyAnswer({ seq: 5 }, 4)).toBe(false);
    expect(shouldApplyAnswer({ seq: 5 }, 6)).toBe(true);
  });
  it("replaying a batch in any order converges to highest seq", () => {
    let stored: { seq: number } | undefined;
    for (const s of [3, 1, 2, 3, 1]) if (shouldApplyAnswer(stored, s)) stored = { seq: s };
    expect(stored!.seq).toBe(3);
  });
  it("schema validates items", () => {
    const r = autosaveItem.safeParse({ questionId: "7f9c2d1e-3b4a-4c5d-8e6f-1a2b3c4d5e6f", seq: 1, status: "answered", value: { selected: ["a"] } });
    expect(r.success).toBe(true);
  });
});
