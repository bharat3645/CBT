"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Plus, Upload } from "lucide-react";
import { Button } from "@cbt/ui";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Loading, Pill, Table, Td, inputCls } from "@/components/ui-kit";
import { AddPersonForm } from "./AddPersonForm";
import { GuardianLinksPanel } from "./GuardianLinksPanel";
import { ImportCsvPanel } from "./ImportCsvPanel";
import { PAGE_SIZE, useBatches, usePeople, useSetPersonStatus, type Person, type PersonRole } from "./api";

const COPY: Record<PersonRole, { title: string; singular: string; subtitle: string }> = {
  student: { title: "Students", singular: "student", subtitle: "Everyone enrolled at your institute. Add one by one or import a CSV." },
  teacher: { title: "Teachers", singular: "teacher", subtitle: "Teaching staff and the batches they are assigned to." },
  parent: { title: "Parents", singular: "parent", subtitle: "Parents see only the children you link to them." },
};

export function PeoplePage({ role }: { role: PersonRole }) {
  const copy = COPY[role];
  const [panel, setPanel] = React.useState<"add" | "import" | null>(null);
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [batchId, setBatchId] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [openLinks, setOpenLinks] = React.useState<string | null>(null);
  const batches = useBatches();
  const people = usePeople({ role, q: debounced, batchId: batchId || undefined, offset: page * PAGE_SIZE });
  const setStatus = useSetPersonStatus();

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const rows = people.data ?? [];
  const head =
    role === "student" ? ["Name", "Email", "Roll no", "Batches", "Status", ""]
    : role === "teacher" ? ["Name", "Email", "Employee code", "Batches", "Status", ""]
    : ["Name", "Email", "Children", "Status", ""];

  return (
    <>
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <Button variant="outline" onClick={() => setPanel(panel === "import" ? null : "import")}>
              <Upload /> Import CSV
            </Button>
            <Button onClick={() => setPanel(panel === "add" ? null : "add")}>
              <Plus /> Add {copy.singular}
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        {panel === "add" && <AddPersonForm role={role} />}
        {panel === "import" && <ImportCsvPanel defaultRole={role} />}

        <div className="flex flex-wrap items-center gap-2">
          <input aria-label={`Search ${copy.title.toLowerCase()}`} className={`${inputCls} max-w-xs`} placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          {role !== "parent" && (
            <select
              aria-label="Filter by batch"
              className={`${inputCls} max-w-56`}
              value={batchId}
              onChange={(e) => {
                setBatchId(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All batches</option>
              {(batches.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {people.isLoading ? (
          <Loading />
        ) : people.error ? (
          <ErrorNote error={people.error} />
        ) : rows.length === 0 ? (
          <EmptyState>{debounced || batchId ? "No one matches this filter." : `No ${copy.title.toLowerCase()} yet. Add one or import a CSV.`}</EmptyState>
        ) : (
          <Table head={head}>
            {rows.map((p) => (
              <PersonRow key={p.id} p={p} role={role} open={openLinks === p.id} onToggleLinks={() => setOpenLinks(openLinks === p.id ? null : p.id)} onStatus={(status) => setStatus.mutate({ id: p.id, status })} busy={setStatus.isPending} cols={head.length} />
            ))}
          </Table>
        )}
        <ErrorNote error={setStatus.error} />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {rows.length ? `Showing ${page * PAGE_SIZE + 1} to ${page * PAGE_SIZE + rows.length}` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={rows.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function PersonRow({ p, role, open, onToggleLinks, onStatus, busy, cols }: {
  p: Person; role: PersonRole; open: boolean; onToggleLinks: () => void; onStatus: (s: "active" | "inactive") => void; busy: boolean; cols: number;
}) {
  const inactive = p.status === "inactive";
  return (
    <>
      <tr className={inactive ? "opacity-60" : undefined}>
        <Td className="font-medium">{p.name}</Td>
        <Td>{p.email}</Td>
        {role === "student" && <Td>{p.rollNo ?? "-"}</Td>}
        {role === "teacher" && <Td>{p.employeeCode ?? "-"}</Td>}
        {role === "parent" ? (
          <Td>{p.childNames.length ? p.childNames.join(", ") : <span className="text-muted-foreground">None linked</span>}</Td>
        ) : (
          <Td>{p.batchNames.length ? p.batchNames.join(", ") : <span className="text-muted-foreground">None</span>}</Td>
        )}
        <Td>
          <Pill tone={inactive ? "neutral" : "good"}>{inactive ? "Inactive" : "Active"}</Pill>
        </Td>
        <Td className="text-right">
          <div className="flex justify-end gap-3 text-xs">
            {role === "parent" && p.guardianId && (
              <button className="text-accent-foreground hover:underline" onClick={onToggleLinks} aria-expanded={open}>
                {open ? "Hide children" : "Manage children"}
              </button>
            )}
            <button className={inactive ? "text-accent-foreground hover:underline" : "text-destructive hover:underline"} disabled={busy} onClick={() => onStatus(inactive ? "active" : "inactive")}>
              {inactive ? "Reactivate" : "Deactivate"}
            </button>
          </div>
        </Td>
      </tr>
      {open && p.guardianId && (
        <tr>
          <td colSpan={cols} className="border-t border-border px-4 py-3">
            <GuardianLinksPanel parent={p} />
          </td>
        </tr>
      )}
    </>
  );
}
