"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { childLevel, type SyllabusLevel, type SyllabusTreeNode } from "@cbt/contracts/syllabus";
import { cn } from "@cbt/ui";
import { Pill, inputCls } from "@/components/ui-kit";
import type { ProgressStatus } from "./api";

export type TreeActions = {
  /** admin: edit the structure */
  onAdd?: (parent: SyllabusTreeNode, level: SyllabusLevel, name: string) => void;
  onRename?: (node: SyllabusTreeNode, name: string) => void;
  onDelete?: (node: SyllabusTreeNode) => void;
  /** admin / teacher: mark a topic for the selected batch */
  onProgress?: (topic: SyllabusTreeNode, status: ProgressStatus) => void;
};

const LEVEL_LABEL: Record<SyllabusLevel, string> = { exam: "Exam", subject: "Subject", unit: "Unit", chapter: "Chapter", topic: "Topic" };
const STATUS_LABEL: Record<ProgressStatus, string> = { not_started: "Not started", in_progress: "In progress", completed: "Completed" };

function countTopics(n: SyllabusTreeNode): number {
  return n.level === "topic" ? 1 : n.children.reduce((s, c) => s + countTopics(c), 0);
}

export function SyllabusTree({
  nodes,
  status,
  percentByNode,
  actions,
  busy,
}: {
  nodes: SyllabusTreeNode[];
  /** topicId -> status for the selected batch (omit for a plain structure view) */
  status?: Map<string, ProgressStatus>;
  percentByNode?: Record<string, number>;
  actions: TreeActions;
  busy?: boolean;
}) {
  // exams and subjects start open; everything below opens on demand
  const [open, setOpen] = React.useState<Set<string>>(() => {
    const s = new Set<string>();
    const walk = (n: SyllabusTreeNode) => {
      if (n.level === "exam" || n.level === "subject") s.add(n.id);
      n.children.forEach(walk);
    };
    nodes.forEach(walk);
    return s;
  });
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const all = React.useMemo(() => {
    const ids: string[] = [];
    const walk = (n: SyllabusTreeNode) => {
      if (n.children.length) ids.push(n.id);
      n.children.forEach(walk);
    };
    nodes.forEach(walk);
    return ids;
  }, [nodes]);

  return (
    <div>
      <div className="mb-2 flex justify-end gap-3 text-xs">
        <button className="text-accent-foreground hover:underline" onClick={() => setOpen(new Set(all))}>
          Expand all
        </button>
        <button className="text-accent-foreground hover:underline" onClick={() => setOpen(new Set())}>
          Collapse all
        </button>
      </div>
      <ul className="space-y-0.5" role="tree">
        {nodes.map((n) => (
          <Row key={n.id} node={n} depth={0} open={open} toggle={toggle} status={status} percentByNode={percentByNode} actions={actions} busy={busy} />
        ))}
      </ul>
    </div>
  );
}

function Row({ node, depth, open, toggle, status, percentByNode, actions, busy }: {
  node: SyllabusTreeNode; depth: number; open: Set<string>; toggle: (id: string) => void;
  status?: Map<string, ProgressStatus>; percentByNode?: Record<string, number>; actions: TreeActions; busy?: boolean;
}) {
  const [mode, setMode] = React.useState<"idle" | "add" | "rename">("idle");
  const [text, setText] = React.useState("");
  const kids = node.children;
  const expanded = open.has(node.id);
  const isTopic = node.level === "topic";
  const nextLevel = childLevel(node.level);
  const pct = percentByNode?.[node.id];
  const st = status?.get(node.id) ?? "not_started";
  const canEdit = !!(actions.onAdd || actions.onRename || actions.onDelete);

  function commit(e: React.FormEvent) {
    e.preventDefault();
    const name = text.trim();
    if (!name) return;
    if (mode === "add" && nextLevel) actions.onAdd?.(node, nextLevel, name);
    if (mode === "rename") actions.onRename?.(node, name);
    setMode("idle");
    setText("");
  }

  return (
    <li role="treeitem" aria-expanded={kids.length ? expanded : undefined}>
      <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60" style={{ paddingLeft: 8 + depth * 20 }}>
        {kids.length ? (
          <button onClick={() => toggle(node.id)} aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`} className="text-muted-foreground">
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="inline-block size-4" />
        )}
        <span className={cn("text-sm", depth === 0 ? "font-semibold" : node.level === "subject" ? "font-medium" : "")}>{node.name}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">{LEVEL_LABEL[node.level]}</span>
        {!isTopic && kids.length > 0 && <span className="text-[11px] text-muted-foreground">{countTopics(node)} topics</span>}

        <span className="ml-auto flex items-center gap-2">
          {pct !== undefined && !isTopic && (
            <span className="flex items-center gap-2" title={`${pct}% of topics completed`}>
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
            </span>
          )}
          {isTopic && status && (
            actions.onProgress ? (
              <select
                aria-label={`Progress for ${node.name}`}
                value={st}
                disabled={busy}
                onChange={(e) => actions.onProgress?.(node, e.target.value as ProgressStatus)}
                className="h-7 rounded-md border border-input bg-card px-1.5 text-xs"
              >
                {(Object.keys(STATUS_LABEL) as ProgressStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            ) : (
              <Pill tone={st === "completed" ? "good" : st === "in_progress" ? "warn" : "neutral"}>{STATUS_LABEL[st]}</Pill>
            )
          )}
          {canEdit && (
            <span className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              {actions.onAdd && nextLevel && (
                <button className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={`Add ${nextLevel} under ${node.name}`} onClick={() => { setMode("add"); setText(""); }}>
                  <Plus className="size-3.5" />
                </button>
              )}
              {actions.onRename && (
                <button className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={`Rename ${node.name}`} onClick={() => { setMode("rename"); setText(node.name); }}>
                  <Pencil className="size-3.5" />
                </button>
              )}
              {actions.onDelete && (
                <button
                  className="rounded p-1 text-destructive hover:bg-muted"
                  aria-label={`Delete ${node.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete "${node.name}"${kids.length ? " and everything under it" : ""}?`)) actions.onDelete?.(node);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </span>
          )}
        </span>
      </div>
      {mode !== "idle" && (
        <form onSubmit={commit} className="flex items-center gap-2 py-1" style={{ paddingLeft: 36 + depth * 20 }}>
          <input
            autoFocus
            aria-label={mode === "add" ? `New ${nextLevel} name` : "New name"}
            className={cn(inputCls, "h-8 max-w-xs")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "add" ? `New ${nextLevel}` : "Name"}
          />
          <button type="submit" className="text-xs font-medium text-accent-foreground hover:underline">
            Save
          </button>
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setMode("idle")}>
            Cancel
          </button>
        </form>
      )}
      {kids.length > 0 && expanded && (
        <ul role="group" className="space-y-0.5">
          {kids.map((c) => (
            <Row key={c.id} node={c} depth={depth + 1} open={open} toggle={toggle} status={status} percentByNode={percentByNode} actions={actions} busy={busy} />
          ))}
        </ul>
      )}
    </li>
  );
}

