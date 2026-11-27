import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, StatusPill, type ExamStatus } from "@cbt/ui";

export function PageHeader({ title, subtitle, actions, hero }: { title: string; subtitle?: string; actions?: React.ReactNode; hero?: boolean }) {
  if (hero) {
    // Dashboards open on a warm brown band; the action buttons sit on it in the light card style.
    return (
      <div className="hero-band relative mb-8 flex flex-wrap items-end justify-between gap-4 overflow-hidden px-6 py-7 md:px-8 md:py-9">
        <div className="relative max-w-2xl">
          <h1 className="text-3xl md:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm font-semibold text-primary-foreground/80 md:text-base">{subtitle}</p>}
        </div>
        {actions && <div className="relative flex gap-2">{actions}</div>}
      </div>
    );
  }
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function StatGrid({ stats }: { stats: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="lift relative overflow-hidden p-6">
          <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-sidebar-primary" />
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{s.label}</div>
          <div className="stat-value mt-2 text-4xl">{s.value}</div>
          {s.hint && <div className="mt-2 text-xs text-muted-foreground">{s.hint}</div>}
        </Card>
      ))}
    </div>
  );
}

export type Row = { cells: React.ReactNode[]; href?: string };

export function ListCard({ title, action, columns, rows }: { title: string; action?: { label: string; href: string }; columns: string[]; rows: Row[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {action && (
          <Link href={action.href} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/70">
            {action.label}
          </Link>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-2">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              {columns.map((c) => (
                <th key={c} className="px-5 py-2.5 font-bold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border transition-colors hover:bg-muted/60">
                {r.cells.map((c, j) => (
                  <td key={j} className="px-5 py-3">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function Bar({ label, value, color = "bg-primary" }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="fig text-muted-foreground">{value}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={`fill-in h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function Status({ s, label }: { s: ExamStatus; label?: string }) {
  return <StatusPill status={s}>{label}</StatusPill>;
}
