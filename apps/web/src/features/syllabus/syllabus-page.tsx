"use client";

import * as React from "react";
import { Copy, Plus } from "lucide-react";
import type { SyllabusTreeNode } from "@cbt/contracts/syllabus";
import { Button } from "@cbt/ui";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Field, Loading, Panel, SuccessNote, inputCls } from "@/components/ui-kit";
import { useSelectedChild } from "@/features/parent/child";
import { useBatches } from "@/features/people/api";
import {
  useBatchProgress, useCopyTemplate, useCreateNode, useDeleteNode, useRenameNode, useSetProgress, useSyllabusTree, useTemplates,
  type ProgressStatus,
} from "./api";
import { SyllabusTree, type TreeActions } from "./syllabus-tree";

type Role = "admin" | "teacher" | "student" | "parent";

const SUBTITLE: Record<Role, string> = {
  admin: "Build your syllabus tree (exam, subject, unit, chapter, topic) or copy a template, then track each batch's progress.",
  teacher: "Mark topics as taught for your batches. Students and parents see the progress you record.",
  student: "Everything your batch will cover, and how far the class has got.",
  parent: "What your child's batch is studying, and how far the class has got.",
};

/** Role-aware syllabus: the tree comes from /syllabus/tree, progress from /syllabus/batches/:id/progress (per batch). */
export function SyllabusPage({ role }: { role: Role }) {
  const tree = useSyllabusTree();
  const own = useBatches({ enabled: role !== "parent" }); // parents read their child's batches from /children; GET /batches is 403 for them
  const { child } = useSelectedChild(role === "parent");
  const [batchId, setBatchId] = React.useState("");

  const batchOptions =
    role === "parent" ? (child?.batches ?? []).map((b) => ({ id: b.id, name: b.name })) : (own.data ?? []).map((b) => ({ id: b.id, name: b.name }));
  // students/teachers/parents always look at one batch; admins may look at the bare structure
  const defaultBatch = role === "admin" ? "" : (batchOptions[0]?.id ?? "");
  const activeBatch = batchOptions.some((b) => b.id === batchId) ? batchId : defaultBatch;

  const progress = useBatchProgress(activeBatch || undefined);
  const status = React.useMemo(() => new Map((progress.data?.progress ?? []).map((p) => [p.topicId, p.status as ProgressStatus])), [progress.data]);

  const create = useCreateNode();
  const rename = useRenameNode();
  const del = useDeleteNode();
  const setProgress = useSetProgress();
  const mutationError = create.error ?? rename.error ?? del.error ?? setProgress.error;

  const actions: TreeActions = {};
  if (role === "admin") {
    actions.onAdd = (parent, level, name) => create.mutate({ parentId: parent.id, level, name, position: parent.children.length });
    actions.onRename = (node, name) => rename.mutate({ id: node.id, name });
    actions.onDelete = (node) => del.mutate(node.id);
  }
  if ((role === "admin" || role === "teacher") && activeBatch) {
    actions.onProgress = (topic, st) => setProgress.mutate({ batchId: activeBatch, topicId: topic.id, status: st });
  }

  const nodes = tree.data ?? [];
  return (
    <>
      <PageHeader title="Syllabus" subtitle={SUBTITLE[role]} />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          {(batchOptions.length > 0 || role === "admin") && (
            <Field label={role === "admin" ? "Show progress for batch" : "Batch"} className="w-64">
              <select aria-label="Batch" className={inputCls} value={activeBatch} onChange={(e) => setBatchId(e.target.value)}>
                {role === "admin" && <option value="">Structure only</option>}
                {batchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {activeBatch && progress.data && (
            <div className="min-w-48 flex-1 pb-1">
              <div className="mb-1 flex justify-between text-xs">
                <span>Overall progress</span>
                <span className="text-muted-foreground">{progress.data.overallPercent}% of topics completed</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress.data.overallPercent}%` }} />
              </div>
            </div>
          )}
        </div>

        <ErrorNote error={mutationError} />
        {progress.error && <ErrorNote error={progress.error} />}

        {tree.isLoading ? (
          <Loading />
        ) : tree.error ? (
          <ErrorNote error={tree.error} />
        ) : nodes.length === 0 ? (
          role === "admin" ? <EmptyState>No syllabus yet. Copy a template below or add an exam to start your own.</EmptyState> : <EmptyState>The institute has not set up a syllabus yet.</EmptyState>
        ) : (
          <Panel>
            {role !== "admin" && !activeBatch && <p className="mb-2 text-sm text-muted-foreground">You are not in a batch yet, so no progress is shown.</p>}
            <SyllabusTree
              // remount when the tree shape or batch changes so the default expansion is recomputed
              key={`${nodes.length}-${nodes[0]?.id}`}
              nodes={nodes}
              status={activeBatch ? status : undefined}
              percentByNode={activeBatch ? progress.data?.percentByNode : undefined}
              actions={actions}
              busy={setProgress.isPending}
            />
          </Panel>
        )}

        {role === "admin" && <AdminTools hasTree={nodes.length > 0} onAddExam={(name) => create.mutate({ parentId: null, level: "exam", name, position: nodes.length })} />}
      </div>
    </>
  );
}

/** Admin only: copy a global template into the institute, or start an empty exam. */
function AdminTools({ hasTree, onAddExam }: { hasTree: boolean; onAddExam: (name: string) => void }) {
  const templates = useTemplates();
  const copy = useCopyTemplate();
  const [name, setName] = React.useState("");
  const [copied, setCopied] = React.useState<string | null>(null);
  const roots: SyllabusTreeNode[] = templates.data ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={hasTree ? "Copy another template" : "Start from a template"} description="Copies the whole exam tree into your institute. Your edits never change the template.">
        {templates.isLoading ? (
          <Loading />
        ) : roots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No templates are available.</p>
        ) : (
          <ul className="space-y-2">
            {roots.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <span className="text-sm font-medium">{r.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={copy.isPending}
                  onClick={() => {
                    setCopied(null);
                    copy.mutate(r.id, { onSuccess: (res) => setCopied(`Copied ${r.name}: ${res.nodes} nodes.`) });
                  }}
                  aria-label={`Copy ${r.name}`}
                >
                  <Copy /> Copy
                </Button>
              </li>
            ))}
          </ul>
        )}
        <ErrorNote error={copy.error} className="mt-2" />
        {copied && <SuccessNote className="mt-2">{copied}</SuccessNote>}
      </Panel>
      <Panel title="Add an exam" description="Start an empty syllabus and build the subjects, units, chapters and topics yourself.">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onAddExam(name.trim());
            setName("");
          }}
        >
          <Field label="Exam name" className="flex-1">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Board exams" />
          </Field>
          <Button type="submit" disabled={!name.trim()}>
            <Plus /> Add exam
          </Button>
        </form>
      </Panel>
    </div>
  );
}

/** Compact per-batch progress block for the batch detail page (teachers mark topics here too). */
export function BatchSyllabusProgress({ batchId, editable }: { batchId: string; editable: boolean }) {
  const tree = useSyllabusTree();
  const progress = useBatchProgress(batchId);
  const setProgress = useSetProgress();
  const status = React.useMemo(() => new Map((progress.data?.progress ?? []).map((p) => [p.topicId, p.status as ProgressStatus])), [progress.data]);
  const nodes = tree.data ?? [];
  if (tree.isLoading || progress.isLoading) return <Loading />;
  if (tree.error || progress.error) return <ErrorNote error={tree.error ?? progress.error} />;
  if (!nodes.length) return <EmptyState>The institute has not set up a syllabus yet.</EmptyState>;
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span>Overall progress</span>
          <span className="text-muted-foreground">{progress.data?.overallPercent ?? 0}% of topics completed</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress.data?.overallPercent ?? 0}%` }} />
        </div>
      </div>
      <ErrorNote error={setProgress.error} />
      <SyllabusTree
        nodes={nodes}
        status={status}
        percentByNode={progress.data?.percentByNode}
        actions={editable ? { onProgress: (topic, st) => setProgress.mutate({ batchId, topicId: topic.id, status: st }) } : {}}
        busy={setProgress.isPending}
      />
    </div>
  );
}
