'use client';

import { Download } from 'lucide-react';
import { Button } from '@cbt/ui';
import { PageHeader } from '@/components/dashboard-kit';
import { ScoreTrendChart, TopicAccuracyChart, shortDate, type TrendPoint } from '@/components/charts';
import { EmptyState, Loading, Panel } from '@/components/ui-kit';
import type { ResultView as Result } from '@cbt/contracts/results';
import { reportUrl, useResult } from './api';

const fmtTime = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stock lift relative overflow-hidden p-4">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-sidebar-primary" />
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="stat-value mt-1.5 text-3xl">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function ResultSummary({ r }: { r: Result }) {
  const pct = r.maxScore ? Math.round((r.score / r.maxScore) * 1000) / 10 : 0;
  const topics = r.topics.map((t) => ({ name: t.topicName ?? 'Untagged', accuracy: t.accuracy }));
  const history: TrendPoint[] = [
    ...r.previousTests.map((p) => ({ label: shortDate(p.at), title: p.title, you: p.scorePct })),
    { label: 'This test', title: r.testTitle ?? 'This test', you: pct },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={r.testTitle ?? 'Result'}
        subtitle={`Result v${r.version} (answer key v${r.keyVersion})${r.versions.length > 1 ? `, revised after an answer-key correction, ${r.versions.length} versions kept` : ''}`}
        actions={
          <Button asChild variant="outline">
            <a href={reportUrl(r.attemptId)}><Download /> Download PDF report</a>
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Score" value={`${r.score} / ${r.maxScore}`} sub={`${pct}%`} />
        <Kpi label="Correct" value={r.correct} />
        <Kpi label="Incorrect" value={r.incorrect + r.partial} sub={r.partial ? `${r.partial} partial` : undefined} />
        <Kpi label="Unanswered" value={r.unanswered} />
        <Kpi label="Accuracy" value={`${r.accuracy}%`} />
        <Kpi label="Time" value={fmtTime(r.timeSpentSec)} />
      </section>

      {r.ranks.length > 0 && (
        <section className="hero-band flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-5">
          {r.ranks.map((k) => (
            <div key={k.scope}>
              <div className="text-xs font-bold uppercase tracking-wider text-primary-foreground/70">{k.scope} rank</div>
              <div className="stat-value text-4xl">
                #{k.rank}<span className="text-base font-semibold text-primary-foreground/70"> of {k.participants}</span>
              </div>
              {k.percentile !== null && <div className="text-xs font-semibold text-primary-foreground/80">Percentile {k.percentile}</div>}
            </div>
          ))}
          <p className="text-xs font-semibold text-primary-foreground/70 md:ml-auto md:max-w-xs md:text-right">{r.rankLabel}</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Section-wise marks" description="Marks scored out of the section maximum.">
          <ul className="space-y-4">
            {r.sections.map((s) => {
              const share = s.maxScore ? Math.max(0, Math.min(100, (s.score / s.maxScore) * 100)) : 0;
              return (
                <li key={s.sectionId}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-bold">{s.sectionId}</span>
                    <span className="fig">{s.score} <span className="font-semibold text-muted-foreground">/ {s.maxScore}</span></span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="fill-in h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Topic accuracy" description="Weakest first. Below the 40% line needs work.">
          {topics.length === 0 ? <EmptyState>No topic data for this test.</EmptyState> : <TopicAccuracyChart topics={topics} />}
        </Panel>
      </div>

      {history.length > 1 && (
        <Panel title="Comparison with your last tests">
          <ScoreTrendChart points={history} youLabel="Score" height={220} />
        </Panel>
      )}

      <Panel title="Topics to revise and your next step">
        {r.recommendations.length === 0 ? (
          <EmptyState>No recommendations yet. They appear after 5 attempts on a topic.</EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {r.recommendations.map((x) => (
              <li key={x.topicId} className="lift rounded-lg border-l-4 border-l-primary bg-muted/60 p-4 text-sm">
                <div className="font-bold">{x.topicName}</div>
                <div className="mt-1 text-muted-foreground">{x.reason}</div>
                <div className="mt-1 font-semibold">{x.next}</div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export function ResultPage({ attemptId }: { attemptId: string }) {
  const { data, isLoading, error } = useResult(attemptId);
  if (isLoading) return <Loading label="Loading result..." />;
  if (error || !data) return <p className="p-6 text-sm" role="alert">{(error as Error)?.message ?? 'Result unavailable'}</p>;
  return <ResultSummary r={data} />;
}
