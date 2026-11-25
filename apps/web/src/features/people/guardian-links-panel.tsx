"use client";

import * as React from "react";
import { Button } from "@cbt/ui";
import { ErrorNote, Pill, inputCls } from "@/components/ui-kit";
import { useGuardianLinks, useLinkGuardian, usePeople, useUnlinkGuardian, type Person } from "./api";

/** Admin: verified guardian-student links for one parent (create = verified, remove = revoked). */
export function GuardianLinksPanel({ parent }: { parent: Person }) {
  const guardianId = parent.guardianId!;
  const links = useGuardianLinks(guardianId);
  const [q, setQ] = React.useState("");
  const [pick, setPick] = React.useState("");
  const candidates = usePeople({ role: "student", q, limit: 10 });
  const link = useLinkGuardian();
  const unlink = useUnlinkGuardian();
  const linked = new Set((links.data ?? []).map((l) => l.studentId));
  const options = (candidates.data ?? []).filter((s) => s.studentId && !linked.has(s.studentId));

  return (
    <div className="space-y-3 rounded-md bg-muted/50 p-3" aria-label={`Children of ${parent.name}`}>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked children</h3>
        {links.data?.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {links.data.map((l) => (
              <li key={l.studentId} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-sm">
                {l.studentName}
                {l.rollNo ? <span className="text-xs text-muted-foreground">({l.rollNo})</span> : null}
                {l.status !== "verified" && <Pill tone="warn">{l.status}</Pill>}
                <button
                  className="text-xs text-destructive hover:underline disabled:opacity-50"
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate({ guardianId, studentId: l.studentId })}
                  aria-label={`Unlink ${l.studentName}`}
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No child linked yet. This parent sees nothing until a student is linked.</p>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="text-xs font-medium">Find student</span>
          <input className={`${inputCls} w-48`} placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium">Student</span>
          <select aria-label="Student to link" className={`${inputCls} w-56`} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Select...</option>
            {options.map((s) => (
              <option key={s.studentId!} value={s.studentId!}>
                {s.name}
                {s.rollNo ? ` (${s.rollNo})` : ""}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          disabled={!pick || link.isPending}
          onClick={() => link.mutate({ guardianId, studentId: pick }, { onSuccess: () => setPick("") })}
        >
          Link child
        </Button>
      </div>
      <ErrorNote error={link.error ?? unlink.error} />
    </div>
  );
}
