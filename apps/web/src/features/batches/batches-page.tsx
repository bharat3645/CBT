"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@cbt/ui";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Field, Loading, Panel, Pill, SuccessNote, Table, Td, inputCls } from "@/components/ui-kit";
import { useBatches } from "@/features/people/api";
import { useCreateBatch } from "./api";

/** Admin: every batch, with create. Teacher: only the batches they are assigned to (the API scopes the list). */
export function BatchesPage({ base, canManage }: { base: "/admin" | "/teacher"; canManage: boolean }) {
  const batches = useBatches();
  const create = useCreateBatch();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", code: "", year: String(new Date().getFullYear()) });
  const [created, setCreated] = React.useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setCreated(null);
    const year = Number(form.year);
    create.mutate(
      { name: form.name.trim(), code: form.code.trim() || undefined, year: form.year.trim() && Number.isFinite(year) ? year : undefined },
      {
        onSuccess: (b) => {
          setCreated(b.name);
          setForm((f) => ({ ...f, name: "", code: "" }));
        },
      },
    );
  }

  return (
    <>
      <PageHeader
        title={canManage ? "Batches" : "My batches"}
        subtitle={canManage ? "A batch is a class group. Students join batches, teachers are assigned to them, and tests target them." : "The batches you teach. Open one to see its roster and syllabus progress."}
        actions={
          canManage ? (
            <Button onClick={() => setOpen((o) => !o)}>
              <Plus /> New batch
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4">
        {canManage && open && (
          <Panel title="Create a batch">
            <form onSubmit={submit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Name" hint="For example JEE-2026-B">
                  <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Code (optional)">
                  <input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </Field>
                <Field label="Year">
                  <input type="number" min={2000} max={2100} className={inputCls} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                </Field>
              </div>
              <ErrorNote error={create.error} />
              {created && <SuccessNote>Created batch {created}.</SuccessNote>}
              <Button type="submit" disabled={create.isPending || !form.name.trim()}>
                {create.isPending ? "Creating..." : "Create batch"}
              </Button>
            </form>
          </Panel>
        )}

        {batches.isLoading ? (
          <Loading />
        ) : batches.error ? (
          <ErrorNote error={batches.error} />
        ) : !batches.data?.length ? (
          <EmptyState>{canManage ? "No batches yet. Create the first one." : "You are not assigned to any batch yet."}</EmptyState>
        ) : (
          <Table head={["Batch", "Year", "Students", "Teachers", "Status", ""]}>
            {batches.data.map((b) => (
              <tr key={b.id}>
                <Td className="font-medium">
                  <Link href={`${base}/batches/${b.id}`} className="hover:underline">
                    {b.name}
                  </Link>
                  {b.code ? <span className="ml-2 text-xs text-muted-foreground">{b.code}</span> : null}
                </Td>
                <Td>{b.year ?? "-"}</Td>
                <Td>{b.studentCount}</Td>
                <Td>{b.teacherCount}</Td>
                <Td>
                  <Pill tone={b.status === "active" ? "good" : "neutral"}>{b.status === "active" ? "Active" : "Archived"}</Pill>
                </Td>
                <Td className="text-right">
                  <Link href={`${base}/batches/${b.id}`} className="text-xs text-accent-foreground hover:underline">
                    Open roster
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </>
  );
}
