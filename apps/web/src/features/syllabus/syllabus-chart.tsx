"use client";

import * as React from "react";
import type { SyllabusTreeNode } from "@cbt/contracts/syllabus";
import { cn } from "@cbt/ui";
import { ProgressBarsChart, ProgressRing } from "@/components/charts";

function countTopics(n: SyllabusTreeNode): number {
  return n.level === "topic" ? 1 : n.children.reduce((s, c) => s + countTopics(c), 0);
}

/** Graph view of a batch's syllabus progress: overall ring, one bar per subject, and the units of the chosen subject. */
export function SyllabusProgressChart({ nodes, percentByNode, overall }: { nodes: SyllabusTreeNode[]; percentByNode: Record<string, number>; overall: number }) {
  const multiExam = nodes.length > 1;
  const subjects = nodes.flatMap((exam) =>
    exam.children.filter((c) => c.level === "subject").map((s) => ({ node: s, name: multiExam ? `${exam.name}: ${s.name}` : s.name })),
  );
  const [picked, setPicked] = React.useState<string | null>(null);
  if (subjects.length === 0) return null;
  const pct = (id: string) => percentByNode[id] ?? 0;
  const active = subjects.find((s) => s.node.id === picked) ?? [...subjects].sort((a, b) => pct(a.node.id) - pct(b.node.id))[0]!;
  const units = active.node.children.map((u) => ({ name: u.name, percent: pct(u.id) }));
  const totalTopics = nodes.reduce((s, n) => s + countTopics(n), 0);
  const done = Math.round((overall / 100) * totalTopics);

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <section className="stock flex flex-col items-center justify-center gap-3 p-6 text-center">
        <ProgressRing value={overall} caption="covered" />
        <div>
          <p className="text-sm font-bold">{overall}% of topics completed</p>
          <p className="text-xs text-muted-foreground">{done} of {totalTopics} topics taught</p>
        </div>
      </section>
      <section className="stock p-5 md:p-6">
        <h2 className="text-base font-bold">Progress by subject</h2>
        <p className="mt-1 text-sm text-muted-foreground">Share of each subject's topics the class has finished.</p>
        <div className="mt-4">
          <ProgressBarsChart rows={subjects.map((s) => ({ name: s.name, percent: pct(s.node.id) }))} />
        </div>
        {units.length > 0 && (
          <div className="mt-5 border-t border-border pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Units in</span>
              {subjects.map((s) => (
                <button
                  key={s.node.id}
                  type="button"
                  onClick={() => setPicked(s.node.id)}
                  aria-pressed={s.node.id === active.node.id}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold transition-colors",
                    s.node.id === active.node.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <ProgressBarsChart key={active.node.id} rows={units} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
