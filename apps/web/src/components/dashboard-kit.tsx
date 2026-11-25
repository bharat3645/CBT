import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, StatusPill, type ExamStatus } from "@cbt/ui";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function StatGrid({ stats }: { stats: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="p-5">
          <div className="text-xs text-muted-foreground">{s.label}</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{s.value}</div>
          {s.hint && <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>}
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
          <Link href={action.href} className="text-xs font-medium text-accent-foreground hover:underline">
            {action.label}
          </Link>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              {columns.map((c) => (
                <th key={c} className="px-4 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.cells.map((c, j) => (
                  <td key={j} className="px-4 py-2.5">
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
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function Status({ s, label }: { s: ExamStatus; label?: string }) {
  return <StatusPill status={s}>{label}</StatusPill>;
}
