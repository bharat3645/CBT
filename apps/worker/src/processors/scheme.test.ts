import { describe, it, expect } from "vitest";
import { payloadToKey } from "@cbt/marking";
import { schemeFor } from "./evaluate";

describe("test-level marking scheme", () => {
  const nta = { config: { marking: { correct: 4, wrong: -1, unattempted: 0 } } };
  const payload = { type: "mcq_single" as const, marks: 1, correct: ["A"] };

  it("applies the preset +4 / -1 to questions that carry no marks of their own", () => {
    const key = payloadToKey("q1", "S", payload, schemeFor(nta, {}))!;
    expect(key.marking.correct).toBe(4);
    expect(key.marking.wrong).toBe(1); // stored as a positive penalty, subtracted by the engine
  });

  it("without a preset the question's own marks apply and there is no penalty (the old bug)", () => {
    const key = payloadToKey("q1", "S", payload, schemeFor({}, {}))!;
    expect(key.marking.wrong).toBe(0);
  });
});
