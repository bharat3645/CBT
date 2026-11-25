"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cbt/ui";
import { PageHeader, StatGrid } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Loading, Panel, Pill, Table, Td, fmtDateTime } from "@/components/ui-kit";
import { api } from "@/lib/api-client";

type InstituteRow = {
  id: string;
  name: string;
  slug: string;
  status: "pending" | "approved" | "suspended" | "deactivated";
  createdAt: string;
  adminEmail: string | null;
  counts: { students: number; teachers: number; batches: number; tests: number };
};

const KEY = ["superadmin", "institutes"];
const useInstitutes = () => useQuery({ queryKey: KEY, queryFn: () => api<InstituteRow[]>("/institutes") });

function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; action: "approve" | "suspend" | "reactivate" }) => api(`/institutes/${v.id}/${v.action}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

const tone = (s: string): "good" | "warn" | "bad" => (s === "approved" ? "good" : s === "pending" ? "warn" : "bad");

export function PlatformOverview() {
  const q = useInstitutes();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const rows = q.data ?? [];
  const n = (f: (r: InstituteRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const pending = rows.filter((r) => r.status === "pending").length;
  return (
    <>
      <PageHeader title="Platform overview" subtitle="Every institute on the platform." actions={<Link href="/superadmin/institutes"><Button>Manage institutes</Button></Link>} />
      <div className="space-y-4">
        <StatGrid
          stats={[
            { label: "Institutes", value: String(rows.length) },
            { label: "Awaiting approval", value: String(pending), hint: pending ? "Open Institutes to approve" : "Nothing waiting" },
            { label: "Active institutes", value: String(rows.filter((r) => r.status === "approved").length) },
            { label: "Suspended", value: String(rows.filter((r) => r.status === "suspended").length) },
            { label: "Students", value: String(n((r) => r.counts.students)) },
            { label: "Teachers", value: String(n((r) => r.counts.teachers)) },
            { label: "Batches", value: String(n((r) => r.counts.batches)) },
            { label: "Tests", value: String(n((r) => r.counts.tests)) },
          ]}
        />
      </div>
    </>
  );
}

export function InstitutesPage() {
  const q = useInstitutes();
  const set = useSetStatus();
  return (
    <>
      <PageHeader title="Institutes" subtitle="New sign-ups stay pending until you approve them. Suspending blocks the institute's users." />
      <div className="space-y-4">
        {set.error && <ErrorNote error={set.error} />}
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorNote error={q.error} />
        ) : !q.data?.length ? (
          <EmptyState>No institutes yet.</EmptyState>
        ) : (
          <Panel>
            <div className="overflow-x-auto">
              <Table head={["Institute", "Status", "Created", "Admin", "Students", "Teachers", "Batches", "Tests", ""]}>
                {q.data.map((r) => (
                  <tr key={r.id} data-testid="institute-row" data-name={r.name}>
                    <Td className="font-medium">{r.name}<div className="text-xs font-normal text-muted-foreground">{r.slug}</div></Td>
                    <Td><Pill tone={tone(r.status)}>{r.status}</Pill></Td>
                    <Td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</Td>
                    <Td>{r.adminEmail ?? "-"}</Td>
                    <Td>{r.counts.students}</Td>
                    <Td>{r.counts.teachers}</Td>
                    <Td>{r.counts.batches}</Td>
                    <Td>{r.counts.tests}</Td>
                    <Td className="whitespace-nowrap text-right">
                      {r.status === "pending" && <Button size="sm" disabled={set.isPending} onClick={() => set.mutate({ id: r.id, action: "approve" })}>Approve</Button>}
                      {r.status === "approved" && <Button size="sm" variant="outline" disabled={set.isPending} onClick={() => set.mutate({ id: r.id, action: "suspend" })}>Suspend</Button>}
                      {r.status === "suspended" && <Button size="sm" disabled={set.isPending} onClick={() => set.mutate({ id: r.id, action: "reactivate" })}>Reactivate</Button>}
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
