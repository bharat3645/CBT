"use client";

import * as React from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/* One chart language for the whole app: coffee (--chart-1) for the person, caramel (--chart-2) for the comparison,
 * recessive axes in the muted ink, and a cream tooltip sheet. Colours are tokens, validated in theme.css. */

const tick = { fill: "var(--muted-foreground)", fontSize: 12, fontWeight: 600 };

/** Category labels take less room on a phone so the bars keep most of the width. */
function useNarrow() {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}
const axis = { tick, axisLine: false, tickLine: false } as const;

function Tip({ active, payload, label, unit = "%" }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="stock min-w-36 px-3 py-2 text-xs">
      {label && <div className="mb-1 font-bold">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="fig">{p.value == null ? "-" : `${Math.round(p.value * 10) / 10}${unit}`}</span>
        </div>
      ))}
    </div>
  );
}

export type TrendPoint = { label: string; title?: string; you: number; classAvg?: number | null };

/** Score over time. With class averages it becomes a two-series comparison (legend + direct end labels). */
export function ScoreTrendChart({ points, youLabel = "Score", height = 240 }: { points: TrendPoint[]; youLabel?: string; height?: number }) {
  const id = React.useId().replace(/:/g, "");
  const hasClass = points.some((p) => p.classAvg != null);
  const data = points.map((p) => ({ ...p, name: p.label }));
  return (
    <div style={{ height }} role="img" aria-label={`${youLabel} trend${hasClass ? " against the class average" : ""}`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis dataKey="name" {...axis} dy={6} />
          <YAxis domain={[(min: number) => Math.min(0, Math.floor(min / 10) * 10), 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} {...axis} width={44} />
          <Tooltip content={<Tip />} cursor={{ stroke: "var(--input)", strokeDasharray: "3 3" }} labelFormatter={(_, p) => (p?.[0]?.payload as TrendPoint | undefined)?.title ?? ""} />
          {hasClass && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 8 }} />}
          <Area type="monotone" dataKey="you" name={youLabel} stroke="var(--chart-1)" strokeWidth={2.5} fill={`url(#g-${id})`}
            dot={{ r: 4, fill: "var(--card)", stroke: "var(--chart-1)", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "var(--card)", strokeWidth: 2 }} animationDuration={900} />
          {hasClass && (
            <Line type="monotone" dataKey="classAvg" name="Class average" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="5 4"
              dot={{ r: 3.5, fill: "var(--chart-2)", stroke: "var(--card)", strokeWidth: 2 }} connectNulls animationDuration={900} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Topic accuracy, weakest first, with the 40% "needs work" line drawn in. */
export function TopicAccuracyChart({ topics, max = 8 }: { topics: { name: string; accuracy: number }[]; max?: number }) {
  const narrow = useNarrow();
  const data = [...topics].sort((a, b) => a.accuracy - b.accuracy).slice(0, max).map((t) => ({ ...t, accuracy: Math.round(t.accuracy) }));
  return (
    <div style={{ height: Math.max(160, data.length * 38 + 30) }} role="img" aria-label="Topic accuracy, weakest first">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} {...axis} />
          <YAxis type="category" dataKey="name" width={narrow ? 96 : 150} {...axis} tick={{ ...tick, fontSize: narrow ? 11 : 12, fill: "var(--foreground)" }} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--muted)" }} />
          <ReferenceLine x={40} stroke="var(--chart-bad)" strokeDasharray="4 4" label={{ value: "40%", position: "top", fill: "var(--muted-foreground)", fontSize: 12, fontWeight: 700 }} />
          <Bar dataKey="accuracy" name="Accuracy" radius={[0, 4, 4, 0]} minPointSize={4} animationDuration={800}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.accuracy < 40 ? "var(--chart-bad)" : "var(--chart-1)"} />
            ))}
            <LabelList dataKey="accuracy" position="right" formatter={(v: unknown) => `${v}%`} style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 700 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal progress bars as a chart (syllabus subjects, units). Single series, so no legend: the title names it. */
export function ProgressBarsChart({ rows, label = "Completed" }: { rows: { name: string; percent: number }[]; label?: string }) {
  const narrow = useNarrow();
  const data = rows.map((r) => ({ ...r, percent: Math.round(r.percent), rest: 100 - Math.round(r.percent) }));
  return (
    <div style={{ height: Math.max(140, data.length * 44 + 20) }} role="img" aria-label={`${label} by subject`}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }} barCategoryGap={10}>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="name" width={narrow ? 92 : 140} {...axis} tick={{ ...tick, fontSize: narrow ? 12 : 13, fill: "var(--foreground)" }} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="percent" name={label} stackId="p" fill="var(--chart-1)" radius={[4, 0, 0, 4]} animationDuration={900}>
            <LabelList dataKey="percent" position="insideRight" formatter={(v: unknown) => (Number(v) >= 15 ? `${v}%` : "")} style={{ fill: "var(--primary-foreground)", fontSize: 12, fontWeight: 800 }} />
          </Bar>
          <Bar dataKey="rest" name="Remaining" stackId="p" fill="var(--chart-3)" radius={[0, 4, 4, 0]} animationDuration={900}>
            <LabelList dataKey="percent" position="right" formatter={(v: unknown) => (Number(v) < 15 ? `${v}%` : "")} style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 800 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A headline percentage as a ring: one number, so the ring is decoration around a hero figure. */
export function ProgressRing({ value, size = 148, caption }: { value: number; size?: number; caption?: string }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    const t = requestAnimationFrame(() => setShown(v));
    return () => cancelAnimationFrame(t);
  }, [v]);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-1)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 1s var(--ease-out)" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="stat-value text-3xl">{Math.round(v)}%</div>
        {caption && <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{caption}</div>}
      </div>
    </div>
  );
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
