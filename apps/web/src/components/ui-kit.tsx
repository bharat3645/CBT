"use client";

import * as React from "react";
import { cn } from "@cbt/ui";
import { ApiError } from "@/lib/api-client";

/** Turn an API failure into one readable line (Zod issues become "field: message"). */
export function errorText(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof ApiError) {
    const body = e.body as { issues?: { path?: (string | number)[]; message?: string }[]; field?: string } | undefined;
    if (body?.issues?.length) return body.issues.map((i) => `${i.path?.join(".") || "input"}: ${i.message}`).join("; ");
    if (body?.field) return `${body.field}: ${e.message}`;
    return e.message || fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return <p className="py-6 text-sm text-muted-foreground">{label}</p>;
}

export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className={cn("rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive", className)}>
      {errorText(error)}
    </p>
  );
}

export function SuccessNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="status" className={cn("rounded-md border border-exam-answered/30 bg-exam-answered/5 px-3 py-2 text-sm text-exam-answered", className)}>
      {children}
    </p>
  );
}

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground", className)}>{children}</p>;
}

/** Honest placeholder for something that is not built yet. Never fakes data. */
export function PhaseCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-6">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">Phase 2</span>
      </div>
      <p className="max-w-xl text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="block space-y-1">
        <span className="text-xs font-medium">{label}</span>
        {children}
      </label>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad"; children: React.ReactNode }) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    good: "bg-exam-answered/10 text-exam-answered",
    warn: "bg-exam-flagged/15 text-amber-700",
    bad: "bg-destructive/10 text-destructive",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Table({ head, children, className }: { head: string[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-card", className)}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={`${h}-${i}`} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn("border-t border-border px-4 py-2.5 align-middle", className)} {...p} />;

export function Panel({ title, description, children, className }: { title?: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      {title && <h2 className="text-sm font-semibold">{title}</h2>}
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className={title || description ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function fmtPct(v: number | null | undefined) {
  return v == null ? "-" : `${v}%`;
}
