import { z } from 'zod';

/** Shown next to every rank (SRS 10.3). */
export const RANK_LABEL = 'Institute mock rank: not an official entrance exam rank';

/* ---------- Result settings / release ---------- */
export const tieBreakerSchema = z.enum(['fewer_incorrect', 'higher_section1', 'less_time']);
export const resultSettingsInput = z.object({
  releaseMode: z.enum(['immediate', 'scheduled', 'manual']),
  releaseAt: z.string().datetime().optional(),
  tieBreakers: z.array(tieBreakerSchema).max(3).default([]),
  minPercentileParticipants: z.number().int().min(1).default(30),
  partial: z.object({
    mode: z.enum(['none', 'per_correct_option']),
    perCorrect: z.number().min(0),
    onWrongOption: z.enum(['negative', 'zero']),
  }).optional(),
}).refine((v) => v.releaseMode !== 'scheduled' || !!v.releaseAt, { message: 'releaseAt required for scheduled release', path: ['releaseAt'] });
export type ResultSettingsInput = z.infer<typeof resultSettingsInput>;

/* ---------- Answer-key dispute ---------- */
export const keyCorrectionInput = z.object({
  questionId: z.string().uuid(),
  /** new correct option ids (MCQ) */
  correct: z.array(z.string()).min(1).optional(),
  numeric: z.object({ answer: z.number(), tolerance: z.number().min(0).default(0), toleranceKind: z.enum(['absolute', 'percent']).default('absolute') }).optional(),
  dropped: z.enum(['award_all', 'void']).optional(),
  reason: z.string().max(500).optional(),
}).refine((v) => v.correct || v.numeric || v.dropped, { message: 'Provide correct, numeric or dropped' });
export const keyCorrectionsInput = z.object({ corrections: z.array(keyCorrectionInput).min(1).max(50) });
export type KeyCorrectionsInput = z.infer<typeof keyCorrectionsInput>;

/* ---------- Result views ---------- */
export const sectionScoreSchema = z.object({
  sectionId: z.string(), score: z.number(), maxScore: z.number(),
  correct: z.number(), incorrect: z.number(), partial: z.number(), unanswered: z.number(),
});
export const topicBreakdownSchema = z.object({
  topicId: z.string().nullable(), topicName: z.string().optional(),
  correct: z.number(), attempted: z.number(), total: z.number(), accuracy: z.number(),
});
export const rankInfoSchema = z.object({
  scope: z.enum(['test', 'batch', 'institute']),
  rank: z.number(), participants: z.number(), percentile: z.number().nullable(),
});
export const recommendationSchema = z.object({
  topicId: z.string(), topicName: z.string(), kind: z.enum(['revise', 'skipped']), reason: z.string(), next: z.string(),
});

export const resultViewSchema = z.object({
  attemptId: z.string(), testId: z.string(), testTitle: z.string().optional(),
  version: z.number(), keyVersion: z.number(), schemeVersion: z.number(),
  score: z.number(), maxScore: z.number(),
  correct: z.number(), incorrect: z.number(), partial: z.number(), unanswered: z.number(),
  accuracy: z.number(), timeSpentSec: z.number(),
  sections: z.array(sectionScoreSchema),
  topics: z.array(topicBreakdownSchema),
  ranks: z.array(rankInfoSchema),
  rankLabel: z.literal(RANK_LABEL),
  recommendations: z.array(recommendationSchema),
  previousTests: z.array(z.object({ testId: z.string(), title: z.string().optional(), scorePct: z.number(), at: z.string() })),
  versions: z.array(z.object({ version: z.number(), keyVersion: z.number(), score: z.number(), evaluatedAt: z.string() })),
});
export type ResultView = z.infer<typeof resultViewSchema>;

export const leaderboardRow = z.object({ rank: z.number(), studentId: z.string(), name: z.string().nullable().optional(), score: z.number(), percentile: z.number().nullable() });
export type LeaderboardRow = z.infer<typeof leaderboardRow>;

/* ---------- Analytics ---------- */
export const analyticsQuery = z.object({
  batchId: z.string().uuid().optional(),
  testId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  reteachThreshold: z.coerce.number().min(0).max(100).default(50),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuery>;

export const batchAnalyticsSchema = z.object({
  tests: z.array(z.object({
    testId: z.string(), title: z.string().optional(), participants: z.number(), avgPct: z.number(), medianPct: z.number(),
    distribution: z.array(z.object({ from: z.number(), to: z.number(), count: z.number() })),
  })),
  reteach: z.array(z.object({ topicId: z.string(), topicName: z.string().optional(), accuracy: z.number(), correct: z.number(), attempted: z.number() })),
  difficulty: z.array(z.object({ questionId: z.string(), pctCorrect: z.number(), attempted: z.number() })),
  declining: z.array(z.object({ studentId: z.string(), lastScores: z.array(z.number()) })),
});
export type BatchAnalytics = z.infer<typeof batchAnalyticsSchema>;

export const studentAnalyticsSchema = z.object({
  trend: z.array(z.object({ testId: z.string(), title: z.string().optional(), at: z.string(), scorePct: z.number() })),
  topics: z.array(topicBreakdownSchema),
  speedAccuracy: z.array(z.object({ topicId: z.string().nullable(), avgSec: z.number(), accuracy: z.number() })),
  recommendations: z.array(recommendationSchema),
});
export type StudentAnalytics = z.infer<typeof studentAnalyticsSchema>;

/* ---------- Notifications (M8) ---------- */
export const channelSchema = z.enum(['in_app', 'email', 'sms', 'whatsapp']);
export type Channel = z.infer<typeof channelSchema>;
export const notificationItem = z.object({
  id: z.string(), type: z.string(), title: z.string(), body: z.string(),
  data: z.record(z.unknown()), readAt: z.string().nullable(), createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof notificationItem>;
export const preferenceInput = z.object({
  preferences: z.array(z.object({ type: z.string().min(1), channel: channelSchema, enabled: z.boolean() })).min(1),
});
export type PreferenceInput = z.infer<typeof preferenceInput>;

/** Queue payloads shared by api and worker. */
export const QUEUES = { evaluate: 'evaluate', rank: 'rank', notify: 'notify' } as const;
export interface EvaluateJob { attemptId: string; instituteId: string; reason: 'submit' | 'key_correction' }
export interface RankJob { testId: string; instituteId: string }
export interface NotifyJob { notificationId: string; instituteId: string }
