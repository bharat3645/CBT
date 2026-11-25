import * as React from "react";
import { cn } from "../lib";

/**
 * Builder page template: header (title, actions top right), main column, and a 320px side panel.
 * Used by the question editor, test wizard and conversion editor.
 */
export function BuilderPage({
  title,
  description,
  actions,
  panel,
  children,
  panelPosition = "right",
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  panel?: React.ReactNode;
  panelPosition?: "left" | "right";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={cn("grid gap-6", panelPosition === "left" ? "lg:grid-cols-[300px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_320px]")}>
        {panel && panelPosition === "left" && <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">{panel}</aside>}
        <div className="min-w-0 space-y-4">{children}</div>
        {panel && panelPosition !== "left" && <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">{panel}</aside>}
      </div>
    </div>
  );
}

export function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
