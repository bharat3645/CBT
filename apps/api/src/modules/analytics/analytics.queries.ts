import { sql, type SQL } from 'drizzle-orm';
import {
  accuracyPct, distribution, isDeclining, median, recommend, reteachList,
  type BatchTopicStat, type TopicStat,
} from '@cbt/marking';
import type { AnalyticsQuery } from '@cbt/contracts/results';

/**
 * Analytics reads only M7 tables (evaluations / evaluation_items), which denormalise topic, section and batch,
 * plus syllabus_nodes for topic names. Every query is tenant-scoped by institute_id (in addition to RLS).
 * Only CURRENT evaluation versions count, and void questions are excluded.
 */
const rows = (res: any): any[] => (Array.isArray(res) ? res : res.rows ?? []);

const ATTEMPTED = sql`i.result in ('correct','incorrect','partial')`;

export async function studentTopicStats(db: any, instituteId: string, studentId: string, lastTests = 5): Promise<(TopicStat & { avgSec: number })[]> {
  const res = await db.execute(sql`
    with recent as (
      select id from evaluations
      where institute_id = ${instituteId} and student_id = ${studentId} and is_current and released_at is not null
      order by evaluated_at desc limit ${lastTests}
    )
    select i.topic_id as "topicId", coalesce(n.name, 'Untagged') as "topicName",
           count(*) filter (where i.result = 'correct')::int as correct,
           count(*) filter (where ${ATTEMPTED})::int as attempted,
           count(*) filter (where i.result <> 'void')::int as total,
           coalesce(avg(i.time_spent_sec) filter (where ${ATTEMPTED}), 0)::float as "avgSec"
    from evaluation_items i
    join recent r on r.id = i.evaluation_id
    left join syllabus_nodes n on n.id = i.topic_id
    where i.institute_id = ${instituteId} and i.topic_id is not null
    group by i.topic_id, n.name`);
  return rows(res);
}

/** Topic stats for exactly one attempt's current evaluation (result page + report). */
export async function attemptTopicStats(db: any, instituteId: string, evaluationId: string) {
  const res = await db.execute(sql`
    select i.topic_id as "topicId", coalesce(n.name, 'Untagged') as "topicName",
           count(*) filter (where i.result = 'correct')::int as correct,
           count(*) filter (where ${ATTEMPTED})::int as attempted,
           count(*) filter (where i.result <> 'void')::int as total
    from evaluation_items i
    left join syllabus_nodes n on n.id = i.topic_id
    where i.institute_id = ${instituteId} and i.evaluation_id = ${evaluationId}
    group by i.topic_id, n.name order by 1`);
  return rows(res) as TopicStat[];
}

export async function scoreTrend(db: any, instituteId: string, studentId: string, limit = 10) {
  const res = await db.execute(sql`
    select e.test_id as "testId", t.title, e.evaluated_at as "at",
           case when e.max_score = 0 then 0 else round((e.score / e.max_score * 100)::numeric, 1) end::float as "scorePct"
    from evaluations e left join tests t on t.id = e.test_id
    where e.institute_id = ${instituteId} and e.student_id = ${studentId} and e.is_current and e.released_at is not null
    order by e.evaluated_at desc limit ${limit}`);
  return (rows(res) as any[]).reverse().map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
}

function batchFilter(q: Pick<AnalyticsQuery, 'batchId' | 'testId' | 'from' | 'to'>, alias = 'e'): SQL {
  const a = sql.raw(alias);
  return sql`${q.batchId ? sql`and ${a}.batch_id = ${q.batchId}` : sql``}
             ${q.testId ? sql`and ${a}.test_id = ${q.testId}` : sql``}
             ${q.from ? sql`and ${a}.evaluated_at >= ${q.from}` : sql``}
             ${q.to ? sql`and ${a}.evaluated_at <= ${q.to}` : sql``}`;
}

export async function batchTopicStats(db: any, instituteId: string, q: AnalyticsQuery): Promise<BatchTopicStat[]> {
  const res = await db.execute(sql`
    select i.topic_id as "topicId", coalesce(n.name, 'Untagged') as "topicName",
           count(*) filter (where i.result = 'correct')::int as correct,
           count(*) filter (where ${ATTEMPTED})::int as attempted
    from evaluation_items i
    join evaluations e on e.id = i.evaluation_id and e.is_current
    left join syllabus_nodes n on n.id = i.topic_id
    where i.institute_id = ${instituteId} and i.topic_id is not null ${batchFilter(q)}
    group by i.topic_id, n.name`);
  return rows(res);
}

export async function questionDifficulty(db: any, instituteId: string, q: AnalyticsQuery) {
  const res = await db.execute(sql`
    select i.question_id as "questionId",
           count(*) filter (where ${ATTEMPTED})::int as attempted,
           coalesce(round(100.0 * count(*) filter (where i.result = 'correct') / nullif(count(*) filter (where ${ATTEMPTED}), 0), 1), 0)::float as "pctCorrect"
    from evaluation_items i join evaluations e on e.id = i.evaluation_id and e.is_current
    where i.institute_id = ${instituteId} ${batchFilter(q)}
    group by i.question_id order by "pctCorrect" asc limit 200`);
  return rows(res);
}

export async function testScorePcts(db: any, instituteId: string, q: AnalyticsQuery) {
  const res = await db.execute(sql`
    select e.test_id as "testId", e.student_id as "studentId",
           case when e.max_score = 0 then 0 else (e.score / e.max_score * 100) end::float as pct
    from evaluations e
    where e.institute_id = ${instituteId} and e.is_current ${batchFilter(q)}`);
  return rows(res) as { testId: string; studentId: string; pct: number }[];
}

export async function recentScoresByStudent(db: any, instituteId: string, q: AnalyticsQuery) {
  const res = await db.execute(sql`
    select * from (
      select e.student_id as "studentId", e.test_id as "testId", e.evaluated_at as "at",
             case when e.max_score = 0 then 0 else (e.score / e.max_score * 100) end::float as "scorePct",
             row_number() over (partition by e.student_id order by e.evaluated_at desc) rn
      from evaluations e
      where e.institute_id = ${instituteId} and e.is_current ${batchFilter({ batchId: q.batchId })}
    ) x where rn <= 6`);
  return rows(res) as { studentId: string; testId: string; at: string; scorePct: number }[];
}

export async function batchAnalytics(db: any, instituteId: string, q: AnalyticsQuery) {
  const [topicStats, difficulty, pcts, recent] = await Promise.all([
    batchTopicStats(db, instituteId, q),
    questionDifficulty(db, instituteId, q),
    testScorePcts(db, instituteId, q),
    recentScoresByStudent(db, instituteId, q),
  ]);

  const byTest = new Map<string, number[]>();
  for (const p of pcts) byTest.set(p.testId, [...(byTest.get(p.testId) ?? []), p.pct]);
  const titles = new Map<string, string>();
  if (byTest.size) {
    const ids = sql.join([...byTest.keys()].map((id) => sql`${id}`), sql`, `);
    for (const t of rows(await db.execute(sql`select id, title from tests where institute_id = ${instituteId} and id in (${ids})`))) titles.set(t.id, t.title);
  }
  const tests = [...byTest].map(([testId, xs]) => ({
    testId, title: titles.get(testId), participants: xs.length,
    avgPct: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10,
    medianPct: Math.round(median(xs) * 10) / 10,
    distribution: distribution(xs),
  }));

  const byStudent = new Map<string, typeof recent>();
  for (const r of recent) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
  const declining = [...byStudent]
    .filter(([, pts]) => isDeclining(pts))
    .map(([studentId, pts]) => ({
      studentId,
      lastScores: [...pts].sort((a, b) => +new Date(a.at) - +new Date(b.at)).map((p) => Math.round(p.scorePct * 10) / 10).slice(-4),
    }));

  return {
    tests,
    reteach: reteachList(topicStats, q.reteachThreshold).map((t) => ({
      topicId: t.topicId, topicName: t.topicName, accuracy: t.accuracy, correct: t.correct, attempted: t.attempted,
    })),
    difficulty,
    declining,
  };
}

export async function studentAnalytics(db: any, instituteId: string, studentId: string) {
  const [stats, trend] = await Promise.all([
    studentTopicStats(db, instituteId, studentId),
    scoreTrend(db, instituteId, studentId),
  ]);
  return {
    trend,
    topics: stats.map((s) => ({ ...s, accuracy: accuracyPct(s.correct, s.attempted) })),
    speedAccuracy: stats.map((s) => ({ topicId: s.topicId, avgSec: Math.round(s.avgSec), accuracy: accuracyPct(s.correct, s.attempted) })),
    recommendations: recommend(stats),
  };
}
