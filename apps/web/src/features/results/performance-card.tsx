"use client";

import Link from "next/link";
import type { StudentAnalytics } from "@cbt/contracts/results";
import { Card, CardContent, CardHeader, CardTitle } from "@cbt/ui";
import { ScoreTrendChart, TopicAccuracyChart, shortDate, type TrendPoint } from "@/components/charts";
import { EmptyState, Loading } from "@/components/ui-kit";

/** Turn analytics into trend points; class averages (teacher view) are joined by test id. */
export function trendPoints(a: StudentAnalytics, classAvg?: Map<string, number>): TrendPoint[] {
  return a.trend.map((t) => ({ label: shortDate(t.at), title: t.title, you: t.scorePct, classAvg: classAvg?.get(t.testId) ?? null }));
}

function delta(points: TrendPoint[]) {
  if (points.length < 2) return null;
  const d = Math.round((points.at(-1)!.you - points.at(-2)!.you) * 10) / 10;
  return d;
}

/** Score trend plus topic accuracy, side by side. Used on the student home, the parent overview and the teacher's student gaps. */
export function PerformanceCard({
  analytics, isLoading, title = "Your performance", youLabel = "Your score", classAvg, moreHref,
}: {
  analytics?: StudentAnalytics; isLoading?: boolean; title?: string; youLabel?: string; classAvg?: Map<string, number>; moreHref?: string;
}) {
  const points = analytics ? trendPoints(analytics, classAvg) : [];
  const d = delta(points);
  const topics = (analytics?.topics ?? []).map((t) => ({ name: t.topicName ?? "Untagged", accuracy: t.accuracy }));
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">Score in every released test, and accuracy by topic.</p>
        </div>
        <div className="flex items-center gap-3">
          {d != null && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${d >= 0 ? "bg-exam-answered/12 text-exam-answered" : "bg-destructive/10 text-destructive"}`}>
              {d >= 0 ? "▲" : "▼"} {Math.abs(d)} pts vs last test
            </span>
          )}
          {moreHref && (
            <Link href={moreHref} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground hover:bg-accent/70">
              Details
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loading />
        ) : !analytics || points.length === 0 ? (
          <EmptyState>The graph appears after the first released result.</EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Score trend</h3>
              <ScoreTrendChart points={points} youLabel={youLabel} />
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Topic accuracy, weakest first</h3>
              {topics.length === 0 ? <EmptyState>No topic data yet.</EmptyState> : <TopicAccuracyChart topics={topics} max={6} />}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
