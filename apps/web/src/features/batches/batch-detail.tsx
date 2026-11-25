"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@cbt/ui";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Loading, Panel, Pill, Table, Td, inputCls } from "@/components/ui-kit";
import { usePeople } from "@/features/people/api";
import { BatchSyllabusProgress } from "@/features/syllabus/syllabus-page";
import { useAssignTeacher, useBatch, useEnrol, useUnassignTeacher, useUnenrol, useUpdateBatch } from "./api";

/** Roster (students and teachers) plus per-batch syllabus progress. Admins edit the roster; teachers view it and mark progress. */
export function BatchDetail({ id, base, canManage }: { id: string; base: "/admin" | "/teacher"; canManage: boolean }) {
  const batch = useBatch(id);
  const students = usePeople({ role: "student", batchId: id, limit: 200 });
  const teachers = usePeople({ role: "teacher", batchId: id, limit: 200 });
  const update = useUpdateBatch(id);

  if (batch.isLoading) return <Loading />;
  if (batch.error || !batch.data) return <ErrorNote error={batch.error ?? new Error("Batch not found")} />;
  const b = batch.data;

  return (
    <>
      <Link href={`${base}/batches`} className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
        <ArrowLeft className="size-3.5" /> All batches
      </Link>
      <PageHeader
        title={b.name}
        subtitle={`${b.year ?? "No year"}${b.code ? ` · ${b.code}` : ""} · ${b.studentCount} students, ${b.teacherCount} teachers`}
        actions={
          canManage ? (
            <Button variant="outline" disabled={update.isPending} onClick={() => update.mutate({ status: b.status === "active" ? "archived" : "active" })}>
              {b.status === "active" ? "Archive batch" : "Reactivate batch"}
            </Button>
          ) : (
            <Pill tone={b.status === "active" ? "good" : "neutral"}>{b.status === "active" ? "Active" : "Archived"}</Pill>
          )
        }
      />
      <ErrorNote error={update.error} className="mb-3" />
      <div className="space-y-6">
        <StudentsRoster batchId={id} canManage={canManage} loading={students.isLoading} error={students.error} rows={students.data ?? []} />
        {canManage && <TeachersRoster batchId={id} loading={teachers.isLoading} error={teachers.error} rows={teachers.data ?? []} />}
        <Panel title="Syllabus progress" description={canManage ? "Mark topics as taught for this batch." : "Mark topics as taught. Students and parents see this."}>
          <BatchSyllabusProgress batchId={id} editable />
        </Panel>
      </div>
    </>
  );
}

type PersonRows = ReturnType<typeof usePeople>["data"];

function StudentsRoster({ batchId, canManage, rows, loading, error }: { batchId: string; canManage: boolean; rows: NonNullable<PersonRows>; loading: boolean; error: unknown }) {
  const all = usePeople({ role: "student", limit: 200 });
  const enrol = useEnrol(batchId);
  const unenrol = useUnenrol(batchId);
  const [pick, setPick] = React.useState("");
  const inBatch = new Set(rows.map((r) => r.studentId));
  const options = (all.data ?? []).filter((s) => s.studentId && !inBatch.has(s.studentId));

  return (
    <Panel title={`Students (${rows.length})`}>
      <div className="space-y-3">
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="text-xs font-medium">Add a student</span>
              <select aria-label="Student to enrol" className={`${inputCls} w-64`} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Select...</option>
                {options.map((s) => (
                  <option key={s.studentId!} value={s.studentId!}>
                    {s.name}
                    {s.rollNo ? ` (${s.rollNo})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" disabled={!pick || enrol.isPending} onClick={() => enrol.mutate([pick], { onSuccess: () => setPick("") })}>
              Add to batch
            </Button>
          </div>
        )}
        <ErrorNote error={enrol.error ?? unenrol.error ?? error} />
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState>No students in this batch yet.</EmptyState>
        ) : (
          <Table head={canManage ? ["Name", "Email", "Roll no", ""] : ["Name", "Email", "Roll no"]}>
            {rows.map((s) => (
              <tr key={s.id}>
                <Td className="font-medium">{s.name}</Td>
                <Td>{s.email}</Td>
                <Td>{s.rollNo ?? "-"}</Td>
                {canManage && (
                  <Td className="text-right">
                    <button className="text-xs text-destructive hover:underline disabled:opacity-50" disabled={unenrol.isPending} onClick={() => unenrol.mutate(s.studentId!)} aria-label={`Remove ${s.name} from batch`}>
                      Remove
                    </button>
                  </Td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Panel>
  );
}

function TeachersRoster({ batchId, rows, loading, error }: { batchId: string; rows: NonNullable<PersonRows>; loading: boolean; error: unknown }) {
  const all = usePeople({ role: "teacher", limit: 200 });
  const assign = useAssignTeacher(batchId);
  const unassign = useUnassignTeacher(batchId);
  const [pick, setPick] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const assigned = new Set(rows.map((r) => r.teacherId));
  const options = (all.data ?? []).filter((t) => t.teacherId && !assigned.has(t.teacherId));

  return (
    <Panel title={`Teachers (${rows.length})`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-xs font-medium">Assign a teacher</span>
            <select aria-label="Teacher to assign" className={`${inputCls} w-64`} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Select...</option>
              {options.map((t) => (
                <option key={t.teacherId!} value={t.teacherId!}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Subject (optional)</span>
            <input className={`${inputCls} w-44`} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <Button
            size="sm"
            disabled={!pick || assign.isPending}
            onClick={() =>
              assign.mutate(
                { teacherId: pick, subject: subject.trim() || undefined },
                {
                  onSuccess: () => {
                    setPick("");
                    setSubject("");
                  },
                },
              )
            }
          >
            Assign
          </Button>
        </div>
        <ErrorNote error={assign.error ?? unassign.error ?? error} />
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState>No teacher is assigned to this batch.</EmptyState>
        ) : (
          <Table head={["Name", "Email", "Employee code", ""]}>
            {rows.map((t) => (
              <tr key={t.id}>
                <Td className="font-medium">{t.name}</Td>
                <Td>{t.email}</Td>
                <Td>{t.employeeCode ?? "-"}</Td>
                <Td className="text-right">
                  <button className="text-xs text-destructive hover:underline disabled:opacity-50" disabled={unassign.isPending} onClick={() => unassign.mutate(t.teacherId!)} aria-label={`Unassign ${t.name}`}>
                    Unassign
                  </button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Panel>
  );
}
