/** Pure rule-based analytics (FR-090/093, SRS 12). No ML; every recommendation carries its reason. */

export interface TopicStat {
  topicId: string;
  topicName: string;
  attempted: number; // questions attempted on this topic
  correct: number;
  total: number; // questions seen (incl. unanswered)
}

export interface Recommendation {
  topicId: string;
  topicName: string;
  kind: 'revise' | 'skipped';
  reason: string;
  next: string;
}

export interface RecommendationOptions {
  /** SRS 12.3: only after >= 5 attempts on a topic */
  minAttempts?: number;
  weakBelowPct?: number;
  practiceSetSize?: number;
}

export const accuracyPct = (correct: number, attempted: number): number =>
  attempted === 0 ? 0 : Math.round((correct / attempted) * 1000) / 10;

export function weakTopics(stats: TopicStat[], o: RecommendationOptions = {}): TopicStat[] {
  const min = o.minAttempts ?? 5;
  const below = o.weakBelowPct ?? 50;
  return stats
    .filter((s) => s.attempted >= min && accuracyPct(s.correct, s.attempted) < below)
    .sort((a, b) => accuracyPct(a.correct, a.attempted) - accuracyPct(b.correct, b.attempted));
}

export function recommend(stats: TopicStat[], o: RecommendationOptions = {}): Recommendation[] {
  const size = o.practiceSetSize ?? 15;
  const min = o.minAttempts ?? 5;
  const out: Recommendation[] = [];
  for (const s of weakTopics(stats, o)) {
    out.push({
      topicId: s.topicId, topicName: s.topicName, kind: 'revise',
      reason: `You answered ${s.correct} of ${s.attempted} '${s.topicName}' questions correctly in your recent tests (${accuracyPct(s.correct, s.attempted)}%).`,
      next: `Revise '${s.topicName}' and try a ${size}-question practice set.`,
    });
  }
  for (const s of stats) {
    const skipped = s.total - s.attempted;
    if (s.total >= min && skipped / s.total >= 0.5 && !out.some((r) => r.topicId === s.topicId)) {
      out.push({
        topicId: s.topicId, topicName: s.topicName, kind: 'skipped',
        reason: `You skipped ${skipped} of ${s.total} '${s.topicName}' questions.`,
        next: `Attempt a short untimed set on '${s.topicName}' to build confidence.`,
      });
    }
  }
  return out;
}

export interface BatchTopicStat { topicId: string; topicName: string; correct: number; attempted: number }

/** "Reteach list": topics where batch accuracy is below threshold (default 50%). */
export function reteachList(stats: BatchTopicStat[], thresholdPct = 50, minAttempts = 5) {
  return stats
    .filter((s) => s.attempted >= minAttempts && accuracyPct(s.correct, s.attempted) < thresholdPct)
    .map((s) => ({ ...s, accuracy: accuracyPct(s.correct, s.attempted) }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

export interface ScorePoint { testId: string; at: string | number | Date; scorePct: number }

/** Declining = N consecutive drops (default 3) ending at the latest test. */
export function isDeclining(points: ScorePoint[], consecutiveDrops = 3): boolean {
  const sorted = [...points].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  if (sorted.length < consecutiveDrops + 1) return false;
  const tail = sorted.slice(-(consecutiveDrops + 1));
  return tail.every((p, i) => i === 0 || p.scorePct < tail[i - 1]!.scorePct);
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function distribution(scorePcts: number[], bucket = 10): { from: number; to: number; count: number }[] {
  const n = Math.ceil(100 / bucket);
  const out = Array.from({ length: n }, (_, i) => ({ from: i * bucket, to: (i + 1) * bucket, count: 0 }));
  for (const p of scorePcts) out[Math.min(n - 1, Math.max(0, Math.floor(p / bucket)))]!.count++;
  return out;
}
