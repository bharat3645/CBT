import { z } from "zod";

/* ---------- Presets (data, not code) ---------- */
export const strictLevel = z.enum(["off", "warn", "strict"]);
export const navigationMode = z.enum(["free", "section_free", "one_way"]);
export const paletteMode = z.enum(["five_state", "simple"]);
export const questionStatus = z.enum([
  "not_visited",
  "not_answered",
  "answered",
  "marked",
  "answered_marked",
]);
export type QuestionStatus = z.infer<typeof questionStatus>;

export const presetConfigSchema = z.object({
  navigation: navigationMode,
  palette: paletteMode,
  marking: z.object({ correct: z.number(), wrong: z.number(), unattempted: z.number().default(0) }),
  numeric: z.object({ enabled: z.boolean(), decimals: z.number().int().min(0).max(6) }),
  strictLevel: strictLevel,
  maxIncidents: z.number().int().min(0), // auto-flag threshold
  explanationsAfterEach: z.boolean(),
  allowMobile: z.boolean(),
});
export type PresetConfig = z.infer<typeof presetConfigSchema>;

export const PRESET_KEYS = ["nta", "private_mcq", "practice"] as const;
export const presetKey = z.enum(PRESET_KEYS);
export type PresetKey = z.infer<typeof presetKey>;

export const DEFAULT_PRESETS: Record<PresetKey, { name: string; config: PresetConfig }> = {
  nta: {
    name: "NTA-style (default)",
    config: {
      navigation: "section_free",
      palette: "five_state",
      marking: { correct: 4, wrong: -1, unattempted: 0 },
      numeric: { enabled: true, decimals: 2 },
      strictLevel: "strict",
      maxIncidents: 3,
      explanationsAfterEach: false,
      allowMobile: false,
    },
  },
  private_mcq: {
    name: "Private-university MCQ",
    config: {
      navigation: "free",
      palette: "five_state",
      marking: { correct: 1, wrong: 0, unattempted: 0 },
      numeric: { enabled: false, decimals: 0 },
      strictLevel: "warn",
      maxIncidents: 5,
      explanationsAfterEach: false,
      allowMobile: false,
    },
  },
  practice: {
    name: "Practice",
    config: {
      navigation: "free",
      palette: "simple",
      marking: { correct: 1, wrong: 0, unattempted: 0 },
      numeric: { enabled: true, decimals: 2 },
      strictLevel: "off",
      maxIncidents: 0,
      explanationsAfterEach: true,
      allowMobile: true,
    },
  },
};

/* ---------- Test wizard ---------- */
export const sectionInput = z.object({
  name: z.string().min(1),
  questionIds: z.array(z.string().uuid()).min(1),
  durationMinutes: z.number().int().positive().optional(),
});

export const createTestInput = z.object({
  title: z.string().min(1).max(200),
  paperId: z.string().uuid(),
  batchIds: z.array(z.string().uuid()).default([]),
  presetKey: presetKey.default("nta"),
  overrides: presetConfigSchema.partial().optional(),
  sections: z.array(sectionInput).min(1),
  durationMinutes: z.number().int().min(1).max(600),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  instructions: z.string().max(10_000).optional(),
});
export type CreateTestInput = z.infer<typeof createTestInput>;

/** Reschedule / rename a test. Duration is locked once anyone has started an attempt. */
export const updateTestInput = z.object({
  title: z.string().min(1).max(200).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
  instructions: z.string().max(10_000).nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type UpdateTestInput = z.infer<typeof updateTestInput>;

export const testStatus = z.enum(["draft", "published", "closed"]);

/* ---------- Attempt / autosave ---------- */
export const attemptStatus = z.enum(["in_progress", "submitted", "auto_submitted", "flagged"]);
export type AttemptStatus = z.infer<typeof attemptStatus>;

export const answerValue = z.object({
  selected: z.array(z.string()).default([]), // option ids (MCQ / multi)
  numeric: z.string().nullable().default(null),
});
export type AnswerValue = z.infer<typeof answerValue>;

export const autosaveItem = z.object({
  questionId: z.string().uuid(),
  seq: z.number().int().nonnegative(), // client-monotonic per attempt
  status: questionStatus,
  value: answerValue,
  timeSpentMs: z.number().int().nonnegative().default(0),
});
export type AutosaveItem = z.infer<typeof autosaveItem>;

export const autosaveInput = z.object({ items: z.array(autosaveItem).min(1).max(100) });
export const autosaveResult = z.object({
  applied: z.number(),
  ignored: z.number(), // stale or duplicate sequence numbers
  highestSeq: z.number(),
  serverRemainingMs: z.number(),
  status: attemptStatus,
});

export const startAttemptResult = z.object({
  attemptId: z.string().uuid(),
  serverNow: z.string().datetime(),
  deadline: z.string().datetime(),
  remainingMs: z.number(),
  config: presetConfigSchema,
  resumedAnswers: z.array(autosaveItem),
});

export const incidentType = z.enum([
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
  "copy_paste",
  "context_menu",
  "network_lost",
]);
export const incidentInput = z.object({
  type: incidentType,
  occurredAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative().optional(),
  detail: z.string().max(500).optional(),
});
export type IncidentInput = z.infer<typeof incidentInput>;

export const submitReceipt = z.object({
  attemptId: z.string().uuid(),
  receiptCode: z.string(),
  submittedAt: z.string().datetime(),
  answeredCount: z.number(),
  totalQuestions: z.number(),
  auto: z.boolean(),
});
export type SubmitReceipt = z.infer<typeof submitReceipt>;

/* ---------- Pure timer helpers (server-authoritative) ---------- */
/** Deadline = min(start + duration, window end). Never trust client clocks. */
export function computeDeadline(startedAt: Date, durationMinutes: number, windowEnd?: Date | null): Date {
  const byDuration = startedAt.getTime() + durationMinutes * 60_000;
  const t = windowEnd ? Math.min(byDuration, windowEnd.getTime()) : byDuration;
  return new Date(t);
}
export function remainingMs(deadline: Date, now: Date): number {
  return Math.max(0, deadline.getTime() - now.getTime());
}
/** Grace window for in-flight autosaves after deadline. */
export const SUBMIT_GRACE_MS = 5_000;
export function isExpired(deadline: Date, now: Date, graceMs = 0): boolean {
  return now.getTime() > deadline.getTime() + graceMs;
}

/* ---------- Pure autosave merge (idempotent, order-independent) ---------- */
export interface StoredAnswer { seq: number }
/** An incoming write wins only if its seq is strictly greater than the stored seq. */
export function shouldApplyAnswer(existing: StoredAnswer | undefined, incomingSeq: number): boolean {
  return !existing || incomingSeq > existing.seq;
}
