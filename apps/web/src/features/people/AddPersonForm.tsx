"use client";

import * as React from "react";
import { Button } from "@cbt/ui";
import { ErrorNote, Field, Panel, SuccessNote, inputCls } from "@/components/ui-kit";
import { useBatches, useCreatePerson, usePeople, type PersonRole } from "./api";

const LABEL: Record<PersonRole, string> = { student: "student", teacher: "teacher", parent: "parent" };

/** One-user form: POST /api/v1/users. The new user gets a set-password invitation by email. */
export function AddPersonForm({ role, onDone }: { role: PersonRole; onDone?: () => void }) {
  const batches = useBatches();
  const students = usePeople({ role: "student", limit: 200 });
  const create = useCreatePerson();
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", rollNo: "", dob: "", employeeCode: "", qualification: "", relation: "" });
  const [batchIds, setBatchIds] = React.useState<string[]>([]);
  const [childIds, setChildIds] = React.useState<string[]>([]);
  const [added, setAdded] = React.useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (id: string) => setBatchIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setAdded(null);
    const clean = (v: string) => (v.trim() ? v.trim() : undefined);
    create.mutate(
      {
        role,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: clean(form.phone),
        rollNo: role === "student" ? clean(form.rollNo) : undefined,
        dob: role === "student" ? clean(form.dob) : undefined,
        employeeCode: role === "teacher" ? clean(form.employeeCode) : undefined,
        qualification: role === "teacher" ? clean(form.qualification) : undefined,
        relation: role === "parent" ? clean(form.relation) : undefined,
        batchIds: role === "parent" ? [] : batchIds,
        childStudentIds: role === "parent" ? childIds : [],
      },
      {
        onSuccess: () => {
          setAdded(form.name.trim());
          setForm({ name: "", email: "", phone: "", rollNo: "", dob: "", employeeCode: "", qualification: "", relation: "" });
          setBatchIds([]);
          setChildIds([]);
          onDone?.();
        },
      },
    );
  }

  return (
    <Panel title={`Add a ${LABEL[role]}`} description="They receive an email with a link to set their password.">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <input required className={inputCls} value={form.name} onChange={set("name")} autoComplete="off" />
          </Field>
          <Field label="Email">
            <input required type="email" className={inputCls} value={form.email} onChange={set("email")} autoComplete="off" />
          </Field>
          <Field label="Phone (optional)" hint="10 to 15 digits, with or without +">
            <input className={inputCls} value={form.phone} onChange={set("phone")} inputMode="tel" />
          </Field>
          {role === "student" && (
            <>
              <Field label="Roll number (optional)">
                <input className={inputCls} value={form.rollNo} onChange={set("rollNo")} />
              </Field>
              <Field label="Date of birth (optional)">
                <input type="date" className={inputCls} value={form.dob} onChange={set("dob")} />
              </Field>
            </>
          )}
          {role === "teacher" && (
            <>
              <Field label="Employee code (optional)">
                <input className={inputCls} value={form.employeeCode} onChange={set("employeeCode")} />
              </Field>
              <Field label="Qualification (optional)">
                <input className={inputCls} value={form.qualification} onChange={set("qualification")} />
              </Field>
            </>
          )}
          {role === "parent" && (
            <Field label="Relation (optional)" hint="For example Mother, Father, Guardian">
              <input className={inputCls} value={form.relation} onChange={set("relation")} />
            </Field>
          )}
        </div>

        {role !== "parent" && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium">{role === "teacher" ? "Assign to batches" : "Enrol in batches"}</legend>
            {batches.data?.length ? (
              <div className="flex flex-wrap gap-2">
                {batches.data.map((b) => (
                  <label key={b.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm">
                    <input type="checkbox" checked={batchIds.includes(b.id)} onChange={() => toggle(b.id)} />
                    {b.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No batches yet. Create one first, or add the person now and enrol them later.</p>
            )}
          </fieldset>
        )}

        {role === "parent" && (
          <Field label="Link children (optional)" hint="Hold Ctrl or Cmd to pick several. You can also link later.">
            <select
              multiple
              aria-label="Children"
              className={`${inputCls} h-28 py-1`}
              value={childIds}
              onChange={(e) => setChildIds(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {(students.data ?? [])
                .filter((s) => s.studentId)
                .map((s) => (
                  <option key={s.studentId!} value={s.studentId!}>
                    {s.name}
                    {s.rollNo ? ` (${s.rollNo})` : ""}
                  </option>
                ))}
            </select>
          </Field>
        )}

        <ErrorNote error={create.error} />
        {added && <SuccessNote>Added {added}.</SuccessNote>}
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Adding..." : `Add ${LABEL[role]}`}
        </Button>
      </form>
    </Panel>
  );
}
