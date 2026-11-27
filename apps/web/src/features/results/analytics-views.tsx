'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ScoreTrendChart, TopicAccuracyChart } from '@/components/charts';
import { Loading, Panel, Table, Td } from '@/components/ui-kit';
import { usePeople } from '@/features/people/api';
import { trendPoints } from './performance-card';
import { useBatchAnalytics, useLeaderboard, useMyAnalytics, useStudentAnalytics } from './api';

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Student: score trend, topic accuracy, recommendations with reasons (FR-091). */
export function StudentAnalyticsView({ studentUserId }: { studentUserId?: string } = {}) {
  // a parent passes the linked child's user id; otherwise this is the signed-in student's own analytics
  const own = useMyAnalytics(!studentUserId);
  const child = useStudentAnalytics(studentUserId);
  const { data, isLoading, error } = studentUserId ? child : own;
  if (isLoading) return <Loading />;
  if (error || !data) return <p className="p-6 text-sm" role="alert">Could not load analytics</p>;
  const topics = data.topics.map((t) => ({ name: t.topicName ?? 'Untagged', accuracy: t.accuracy }));
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Score trend" description="Your percentage in each released test.">
          {data.trend.length < 2 ? <Empty>Take at least two tests to see a trend.</Empty> : <ScoreTrendChart points={trendPoints(data)} />}
        </Panel>
        <Panel title="Topic accuracy" description="Weakest first. Below the 40% line needs work.">
          {topics.length === 0 ? <Empty>No topic data yet.</Empty> : <TopicAccuracyChart topics={topics} />}
        </Panel>
      </div>
      <Panel title="What to do next">
        {data.recommendations.length === 0 ? <Empty>Recommendations appear after 5 attempts on a topic.</Empty> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {data.recommendations.map((r) => (
              <li key={r.topicId} className="lift rounded-lg border-l-4 border-l-primary bg-muted/60 p-4 text-sm">
                <div className="font-bold">{r.next}</div>
                <div className="mt-1 text-muted-foreground">{r.reason}</div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** Teacher / institute: distribution, averages, reteach list, declining students, question difficulty (FR-092/094). */
export function BatchAnalyticsView({ batchId, testId }: { batchId?: string; testId?: string }) {
  const [threshold, setThreshold] = useState(50);
  const [pick, setPick] = useState(0);
  const { data, isLoading, error } = useBatchAnalytics({ batchId, testId, reteachThreshold: threshold });
  const people = usePeople({ role: 'student', limit: 200 });
  const nameOf = (id: string) => people.data?.find((p) => p.id === id || p.studentId === id)?.name ?? 'Student';
  if (isLoading) return <Loading />;
  if (error || !data) return <p className="p-6 text-sm" role="alert">Could not load analytics</p>;
  const shown = data.tests[Math.min(pick, Math.max(data.tests.length - 1, 0))];
  const dist = shown?.distribution.map((d) => ({ name: `${d.from}-${d.to}`, count: d.count })) ?? [];
  return (
    <div className="space-y-6">
      {data.tests.length > 0 && (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {data.tests.slice(0, 4).map((t, i) => (
            <button
              key={t.testId}
              type="button"
              onClick={() => setPick(i)}
              aria-pressed={shown?.testId === t.testId}
              className={`stock lift p-4 text-left ${shown?.testId === t.testId ? 'ring-2 ring-primary' : ''}`}
            >
              <div className="line-clamp-2 text-xs font-bold text-muted-foreground">{t.title ?? 'Test'}</div>
              <div className="stat-value mt-2 text-3xl">{t.avgPct}%</div>
              <div className="mt-1 text-xs text-muted-foreground">average, median {t.medianPct}%, {t.participants} students</div>
            </button>
          ))}
        </section>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Score distribution" description={shown?.title ? `Students per score band in ${shown.title}.` : undefined}>
          {dist.length === 0 ? <Empty>No results yet.</Empty> : (
            <div className="h-56" role="img" aria-label="Score distribution">
              <ResponsiveContainer>
                <BarChart data={dist} margin={{ top: 16, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={tick} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={tick} />
                  <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={tipStyle} />
                  <Bar dataKey="count" name="Students" fill="var(--chart-1)" radius={[4, 4, 0, 0]} animationDuration={800}>
                    <LabelList dataKey="count" position="top" formatter={(v: unknown) => (Number(v) ? String(v) : '')} style={{ fill: 'var(--foreground)', fontSize: 12, fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title={`Reteach list (accuracy below ${threshold}%)`}>
          <label className="mb-3 flex items-center gap-2 text-xs font-bold">Threshold
            <input type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="h-8 w-20 rounded-md border border-input bg-card px-2 font-semibold" />
          </label>
          {data.reteach.length === 0 ? <Empty>No weak topics.</Empty> : (
            <ul className="space-y-3">
              {data.reteach.map((t) => (
                <li key={t.topicId}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-semibold">{t.topicName ?? 'Untagged topic'}</span>
                    <span className="fig text-muted-foreground">{t.accuracy}% ({t.correct}/{t.attempted})</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="fill-in h-full rounded-full bg-destructive" style={{ width: `${t.accuracy}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Declining students" description="Three consecutive drops in score.">
          {data.declining.length === 0 ? <Empty>None flagged.</Empty> : (
            <ul className="space-y-2 text-sm">
              {data.declining.map((d) => <li key={d.studentId} className="flex justify-between gap-3"><span className="font-semibold">{nameOf(d.studentId)}</span><span className="fig">{d.lastScores.join('% → ')}%</span></li>)}
            </ul>
          )}
        </Panel>
        <Panel title="Hardest questions" description="Lowest share of correct answers.">
          {data.difficulty.length === 0 ? <Empty>No answers yet.</Empty> : (
            <ul className="space-y-2.5">
              {data.difficulty.slice(0, 8).map((q, i) => (
                <li key={q.questionId} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 font-semibold text-muted-foreground">Q {i + 1}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="fill-in h-full rounded-full bg-primary" style={{ width: `${q.pctCorrect}%` }} /></div>
                  <span className="fig w-28 shrink-0 text-right text-xs">{q.pctCorrect}% of {q.attempted}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

const tick = { fill: 'var(--muted-foreground)', fontSize: 12, fontWeight: 600 };
const tipStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600 };

export function LeaderboardView({ testId, scope = 'test', scopeId }: { testId: string; scope?: 'test' | 'batch'; scopeId?: string }) {
  const { data, isLoading, isError } = useLeaderboard(testId, scope, scopeId);
  if (isLoading) return <Loading />;
  if (isError || !data) return <Empty>The leaderboard is not available for this test yet.</Empty>;
  if (!data.rows.length) return <Empty>No ranked attempts yet. Ranks appear once results are released.</Empty>;
  const medal = ['bg-sidebar-primary text-sidebar', 'bg-muted-foreground/25 text-foreground', 'bg-accent text-accent-foreground'];
  return (
    <div className="space-y-2">
      <Table head={['Rank', 'Student', 'Score', 'Percentile']}>
        {data.rows.map((r) => (
          <tr key={r.studentId} className="transition-colors hover:bg-muted/60">
            <Td>
              <span className={`inline-flex size-8 items-center justify-center rounded-full text-sm font-extrabold ${medal[r.rank - 1] ?? 'text-muted-foreground'}`}>{r.rank}</span>
            </Td>
            <Td className="font-bold">{r.name ?? 'Student'}</Td>
            <Td className="fig">{r.score}</Td>
            <Td className="fig">{r.percentile ?? '-'}</Td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-muted-foreground">{data.label}</p>
    </div>
  );
}
