'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useBatchAnalytics, useLeaderboard, useMyAnalytics, useStudentAnalytics } from './api';

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Student: score trend, topic accuracy, speed vs accuracy, recommendations with reasons (FR-091). */
export function StudentAnalyticsView({ studentUserId }: { studentUserId?: string } = {}) {
  // a parent passes the linked child's user id; otherwise this is the signed-in student's own analytics
  const own = useMyAnalytics(!studentUserId);
  const child = useStudentAnalytics(studentUserId);
  const { data, isLoading, error } = studentUserId ? child : own;
  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading...</p>;
  if (error || !data) return <p className="p-6 text-sm" role="alert">Could not load analytics</p>;
  const topics = data.topics.map((t) => ({ name: t.topicName ?? 'Untagged', accuracy: t.accuracy }));
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-medium">Score trend</h2>
        {data.trend.length < 2 ? <Empty>Take at least two tests to see a trend.</Empty> : (
          <div className="h-52" role="img" aria-label="Score trend">
            <ResponsiveContainer>
              <LineChart data={data.trend.map((t) => ({ name: t.at.slice(5, 10), pct: t.scorePct }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis domain={[0, 100]} unit="%" /><Tooltip />
                <Line dataKey="pct" name="Score %" stroke="#1d4ed8" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium">Topic accuracy</h2>
        {topics.length === 0 ? <Empty>No topic data yet.</Empty> : (
          <div className="h-60" role="img" aria-label="Topic accuracy">
            <ResponsiveContainer>
              <BarChart data={topics} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} unit="%" />
                <YAxis type="category" dataKey="name" width={110} /><Tooltip />
                <Bar dataKey="accuracy" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium">What to do next</h2>
        {data.recommendations.length === 0 ? <Empty>Recommendations appear after 5 attempts on a topic.</Empty> : (
          <ul className="space-y-2">
            {data.recommendations.map((r) => (
              <li key={r.topicId} className="rounded-lg border p-3 text-sm">
                <div className="text-muted-foreground">{r.reason}</div><div>{r.next}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Teacher / institute: distribution, averages, reteach list, declining students, question difficulty (FR-092/094). */
export function BatchAnalyticsView({ batchId, testId }: { batchId?: string; testId?: string }) {
  const [threshold, setThreshold] = useState(50);
  const { data, isLoading, error } = useBatchAnalytics({ batchId, testId, reteachThreshold: threshold });
  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading...</p>;
  if (error || !data) return <p className="p-6 text-sm" role="alert">Could not load analytics</p>;
  const dist = data.tests[0]?.distribution.map((d) => ({ name: `${d.from}-${d.to}`, count: d.count })) ?? [];
  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3">
        {data.tests.slice(0, 3).map((t) => (
          <div key={t.testId} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Test {t.testId.slice(0, 8)} - {t.participants} students</div>
            <div className="text-lg font-semibold">Avg {t.avgPct}% <span className="text-sm font-normal text-muted-foreground">median {t.medianPct}%</span></div>
          </div>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium">Score distribution</h2>
        {dist.length === 0 ? <Empty>No results yet.</Empty> : (
          <div className="h-52" role="img" aria-label="Score distribution">
            <ResponsiveContainer>
              <BarChart data={dist}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip />
                <Bar dataKey="count" name="Students" fill="#1d4ed8" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">Reteach list (batch accuracy below {threshold}%)</h2>
          <label className="text-xs">Threshold
            <input type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="ml-2 w-16 rounded border px-1" />
          </label>
        </div>
        {data.reteach.length === 0 ? <Empty>No weak topics.</Empty> : (
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Topic</th><th>Accuracy</th><th>Correct / attempted</th></tr></thead>
            <tbody>{data.reteach.map((t) => (
              <tr key={t.topicId} className="border-t"><td className="py-1">{t.topicName ?? t.topicId.slice(0, 8)}</td><td>{t.accuracy}%</td><td>{t.correct}/{t.attempted}</td></tr>
            ))}</tbody></table>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium">Declining students (3 consecutive drops)</h2>
        {data.declining.length === 0 ? <Empty>None flagged.</Empty> : (
          <ul className="space-y-1 text-sm">
            {data.declining.map((d) => <li key={d.studentId}>{d.studentId}: {d.lastScores.join('% > ')}%</li>)}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium">Hardest questions (lowest % correct)</h2>
        <ul className="space-y-1 text-sm">
          {data.difficulty.slice(0, 10).map((q) => <li key={q.questionId}>{q.questionId.slice(0, 8)}: {q.pctCorrect}% of {q.attempted}</li>)}
        </ul>
      </section>
    </div>
  );
}

export function LeaderboardView({ testId, scope = 'test', scopeId }: { testId: string; scope?: 'test' | 'batch'; scopeId?: string }) {
  const { data, isLoading } = useLeaderboard(testId, scope, scopeId);
  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">Loading...</p>;
  return (
    <div>
      <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Rank</th><th>Student</th><th>Score</th><th>Percentile</th></tr></thead>
        <tbody>{data.rows.map((r) => <tr key={r.studentId} className="border-t"><td className="py-1">{r.rank}</td><td>{r.studentId}</td><td>{r.score}</td><td>{r.percentile ?? '-'}</td></tr>)}</tbody></table>
      <p className="mt-2 text-xs text-muted-foreground">{data.label}</p>
    </div>
  );
}
