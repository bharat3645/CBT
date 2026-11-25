'use client';

import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ResultView as Result } from '@cbt/contracts/results';
import { reportUrl, useResult } from './api';

const fmtTime = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
const accColor = (v: number) => (v >= 70 ? 'var(--success)' : v >= 50 ? 'var(--exam-flagged)' : 'var(--destructive)');

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function ResultSummary({ r }: { r: Result }) {
  const pct = r.maxScore ? Math.round((r.score / r.maxScore) * 1000) / 10 : 0;
  const sectionData = r.sections.map((s) => ({ name: s.sectionId, score: s.score, max: s.maxScore }));
  const topicData = r.topics.map((t) => ({ name: t.topicName ?? 'Untagged', accuracy: t.accuracy, n: t.attempted }));
  const history = [...r.previousTests.map((p) => ({ name: p.title ?? p.at.slice(0, 10), pct: p.scorePct })), { name: 'This test', pct }];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{r.testTitle ?? 'Result'}</h1>
          <p className="text-sm text-muted-foreground">
            Result v{r.version} (answer key v{r.keyVersion})
            {r.versions.length > 1 ? ` - revised after an answer-key correction, ${r.versions.length} versions kept` : ''}
          </p>
        </div>
        <a className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" href={reportUrl(r.attemptId)}>Download PDF report</a>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Score" value={`${r.score} / ${r.maxScore}`} sub={`${pct}%`} />
        <Kpi label="Correct" value={r.correct} />
        <Kpi label="Incorrect" value={r.incorrect + r.partial} sub={r.partial ? `${r.partial} partial` : undefined} />
        <Kpi label="Unanswered" value={r.unanswered} />
        <Kpi label="Accuracy" value={`${r.accuracy}%`} />
        <Kpi label="Time" value={fmtTime(r.timeSpentSec)} />
      </section>

      {r.ranks.length > 0 && (
        <section className="rounded-lg border p-4">
          <ul className="flex flex-wrap gap-6">
            {r.ranks.map((k) => (
              <li key={k.scope}>
                <div className="text-xs capitalize text-muted-foreground">{k.scope} rank</div>
                <div className="text-2xl font-semibold">{k.rank}<span className="text-sm font-normal text-muted-foreground"> / {k.participants}</span></div>
                {k.percentile !== null && <div className="text-xs text-muted-foreground">Percentile {k.percentile}</div>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{r.rankLabel}</p>
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium">Section-wise marks</h2>
          <div className="h-56" role="img" aria-label="Section-wise marks bar chart">
            <ResponsiveContainer>
              <BarChart data={sectionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Bar dataKey="max" name="Max" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="score" name="Score" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-medium">Topic accuracy</h2>
          <div className="h-56" role="img" aria-label="Topic accuracy bar chart">
            <ResponsiveContainer>
              <BarChart data={topicData} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" /><YAxis type="category" dataKey="name" width={110} /><Tooltip />
                <Bar dataKey="accuracy" name="Accuracy %" radius={[0, 4, 4, 0]}>
                  {topicData.map((d, i) => <Cell key={i} fill={accColor(d.accuracy)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {history.length > 1 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Comparison with last tests</h2>
          <div className="h-48" role="img" aria-label="Score trend line chart">
            <ResponsiveContainer>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" /><YAxis domain={[0, 100]} unit="%" /><Tooltip />
                <Line type="monotone" dataKey="pct" name="Score %" stroke="var(--chart-1)" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium">Topics to revise and your next step</h2>
        {r.recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recommendations yet. They appear after 5 attempts on a topic.</p>
        ) : (
          <ul className="space-y-2">
            {r.recommendations.map((x) => (
              <li key={x.topicId} className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{x.topicName}</div>
                <div className="text-muted-foreground">{x.reason}</div>
                <div>{x.next}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ResultPage({ attemptId }: { attemptId: string }) {
  const { data, isLoading, error } = useResult(attemptId);
  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading result...</p>;
  if (error || !data) return <p className="p-6 text-sm" role="alert">{(error as Error)?.message ?? 'Result unavailable'}</p>;
  return <ResultSummary r={data} />;
}
