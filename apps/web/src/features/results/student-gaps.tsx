"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@cbt/ui";
import { shortDate } from "@/components/charts";
import { EmptyState, ErrorNote, Loading, Panel, inputCls } from "@/components/ui-kit";
import { api } from "@/lib/api-client";
import { useBatchAnalytics, useStudentAnalytics } from "./api";
import { PerformanceCard } from "./performance-card";

type StudentRow = { studentUserId: string; name: string; rollNo: string | null };

const round1 = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(round1(n))}`;

/**
 * Teacher view: one student against the class. Score per test vs the class average for that test (the gap),
 * and the topics where the student is furthest from mastery.
 */
export function StudentGaps() {
  const students = useQuery({ queryKey: ["feedback-students"], queryFn: () => api<StudentRow[]>("/feedback/students") });
  const list = students.data ?? [];
  const [sid, setSid] = React.useState("");
  const idx = Math.max(0, list.findIndex((s) => s.studentUserId === sid));
  const current = list[idx];
  const analytics = useStudentAnalytics(current?.studentUserId);
  const batch = useBatchAnalytics({ reteachThreshold: 50 });

  const classAvg = React.useMemo(() => new Map((batch.data?.tests ?? []).map((t) => [t.testId, t.avgPct])), [batch.data]);
  const a = analytics.data;
  const gaps = (a?.trend ?? [])
    .filter((t) => classAvg.has(t.testId))
    .map((t) => ({ name: t.title ?? shortDate(t.at), gap: round1(t.scorePct - classAvg.get(t.testId)!), you: t.scorePct, cls: classAvg.get(t.testId)! }));
  const avgGap = gaps.length ? round1(gaps.reduce((s, g) => s + g.gap, 0) / gaps.length) : null;
  const avgYou = a?.trend.length ? round1(a.trend.reduce((s, t) => s + t.scorePct, 0) / a.trend.length) : null;
  const weak = [...(a?.topics ?? [])].filter((t) => t.accuracy < 60).sort((x, y) => x.accuracy - y.accuracy).slice(0, 6);

  const go = (d: number) => {
    const next = list[(idx + d + list.length) % list.length];
    if (next) setSid(next.studentUserId);
  };

  if (students.isLoading) return <Loading />;
  if (students.error) return <ErrorNote error={students.error} />;
  if (!list.length) return <EmptyState>No students in your batches yet.</EmptyState>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block w-72 space-y-1">
          <span className="text-xs font-bold">Student</span>
          <select className={inputCls} aria-label="Student" value={current?.studentUserId ?? ""} onChange={(e) => setSid(e.target.value)}>
            {list.map((s) => (
              <option key={s.studentUserId} value={s.studentUserId}>
                {s.name}{s.rollNo ? ` (${s.rollNo})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous student" onClick={() => go(-1)}><ChevronLeft /></Button>
          <Button variant="outline" size="icon" aria-label="Next student" onClick={() => go(1)}><ChevronRight /></Button>
        </div>
        <span className="pb-2.5 text-xs font-semibold text-muted-foreground">{idx + 1} of {list.length}</span>
      </div>

      {analytics.error ? (
        <ErrorNote error={analytics.error} />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-3">
            <GapTile label="Average score" value={avgYou == null ? "-" : `${avgYou}%`} hint={`${a?.trend.length ?? 0} released tests`} />
            <GapTile
              label="Gap to class average"
              value={avgGap == null ? "-" : `${signed(avgGap)} pts`}
              hint={avgGap == null ? "No shared tests with the class yet" : avgGap >= 0 ? "Above the class on average" : "Below the class on average"}
              tone={avgGap == null ? undefined : avgGap >= 0 ? "good" : "bad"}
            />
            <GapTile label="Topics below 60%" value={String(weak.length)} hint={weak[0] ? `Weakest: ${weak[0].topicName ?? "Untagged"}` : "No weak topics"} />
          </div>

          <PerformanceCard analytics={a} isLoading={analytics.isLoading} title={`${current?.name ?? "Student"} vs the class`} youLabel={current?.name ?? "Student"} classAvg={classAvg} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Gap per test" description="Points above or below the class average in each test.">
              {gaps.length === 0 ? (
                <EmptyState>No tests shared with the class yet.</EmptyState>
              ) : (
                <div style={{ height: Math.max(150, gaps.length * 46 + 20) }} role="img" aria-label="Gap to class average per test">
                  <ResponsiveContainer>
                    <BarChart data={gaps} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap={10}>
                      <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 4" />
                      <XAxis type="number" domain={[(lo: number) => Math.min(lo, 0) - 5, (hi: number) => Math.max(hi, 0) + 5]} hide />
                      <YAxis type="category" dataKey="name" width={130} axisLine={false} tickLine={false} tick={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />
                      <ReferenceLine x={0} stroke="var(--muted-foreground)" />
                      <Tooltip
                        cursor={{ fill: "var(--muted)" }}
                        content={({ active, payload }) => {
                          const p = active ? (payload?.[0]?.payload as (typeof gaps)[number] | undefined) : undefined;
                          return p ? (
                            <div className="stock px-3 py-2 text-xs">
                              <div className="mb-1 font-bold">{p.name}</div>
                              <div>Student <span className="fig">{round1(p.you)}%</span>, class <span className="fig">{round1(p.cls)}%</span></div>
                            </div>
                          ) : null;
                        }}
                      />
                      <Bar dataKey="gap" radius={4} animationDuration={800}>
                        {gaps.map((g) => <Cell key={g.name} fill={g.gap >= 0 ? "var(--chart-good)" : "var(--chart-bad)"} />)}
                        <LabelList dataKey="gap" position="right" formatter={(v: unknown) => signed(Number(v))} style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 800 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <Panel title="Topics to close" description="Lowest accuracy first, with the next step where there is one.">
              {weak.length === 0 ? (
                <EmptyState>Every attempted topic is at 60% or above.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {weak.map((t) => {
                    const rec = a?.recommendations.find((r) => r.topicId === t.topicId);
                    return (
                      <li key={t.topicId ?? t.topicName}>
                        <div className="mb-1.5 flex justify-between text-sm">
                          <span className="font-semibold">{t.topicName ?? "Untagged"}</span>
                          <span className="fig text-muted-foreground">{round1(t.accuracy)}% <span className="font-semibold">({t.correct}/{t.attempted})</span></span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                          <div className={`fill-in h-full rounded-full ${t.accuracy < 40 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.max(t.accuracy, 2)}%` }} />
                        </div>
                        {rec && <p className="mt-1 text-xs text-muted-foreground">{rec.next}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function GapTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="stock lift relative overflow-hidden p-5">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${tone === "good" ? "bg-exam-answered" : tone === "bad" ? "bg-destructive" : "bg-primary"}`} />
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="stat-value mt-1.5 text-3xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
