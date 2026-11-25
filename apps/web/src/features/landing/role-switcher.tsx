"use client";

import * as React from "react";

const roles = [
  {
    id: "admin",
    name: "Admin",
    lead: "Runs the institute.",
    lines: ["Batches, teachers, students and parents in one place", "Approves papers once every flag is cleared", "Publishes results, reports and the audit trail"],
  },
  {
    id: "teacher",
    name: "Teacher",
    lead: "Turns papers into tests.",
    lines: ["Uploads a Word or PDF paper and reviews the questions", "Builds a timed test for the right batches", "Marks attendance and writes feedback in a tap"],
  },
  {
    id: "student",
    name: "Student",
    lead: "Sits the exam, then learns from it.",
    lines: ["A full-screen test with a palette and a server timer", "Score, rank and weak topics the moment it closes", "Practice sets by topic, checked on the server"],
  },
  {
    id: "parent",
    name: "Parent",
    lead: "Sees what the child sees.",
    lines: ["Results and ranks for each linked child", "Attendance as a percentage with the full history", "Written feedback from every teacher"],
  },
] as const;

/** A groove with a cotton card riding in it; the sheet beside it is rewritten for the chosen role. */
export function RoleSwitcher() {
  const [active, setActive] = React.useState<(typeof roles)[number]["id"]>("teacher");
  const role = roles.find((r) => r.id === active)!;
  return (
    <div>
      <div role="tablist" aria-label="Role" className="groove inline-grid grid-cols-4 gap-0 p-1">
        {roles.map((r) => (
          <button
            key={r.id}
            role="tab"
            id={`tab-${r.id}`}
            aria-selected={active === r.id}
            aria-controls="role-panel"
            onClick={() => setActive(r.id)}
            className={`min-h-11 rounded-[9px] px-4 text-sm font-medium transition-[background-color,box-shadow] duration-200 sm:px-6 ${active === r.id ? "bg-card shadow-[var(--edge-stock),var(--cast-flat)]" : "text-muted-foreground hover:text-foreground"}`}
          >
            {r.name}
          </button>
        ))}
      </div>
      <div id="role-panel" role="tabpanel" aria-labelledby={`tab-${active}`} className="stock-tex mt-6 p-6 sm:p-8">
        <h3 className="text-2xl font-semibold tracking-tight">{role.lead}</h3>
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {role.lines.map((l) => (
            <li key={l} className="py-3 text-base">{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
