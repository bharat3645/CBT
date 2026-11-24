import * as React from "react";
import { cn } from "../lib";

export type ExamStatus = "answered" | "not-answered" | "review" | "flagged" | "not-visited";

const bg: Record<ExamStatus, string> = {
  answered: "bg-exam-answered",
  "not-answered": "bg-exam-not-answered",
  review: "bg-exam-review",
  flagged: "bg-exam-flagged",
  "not-visited": "bg-exam-not-visited",
};

export const examStatusLabel: Record<ExamStatus, string> = {
  answered: "Answered",
  "not-answered": "Not answered",
  review: "Marked for review",
  flagged: "Flagged",
  "not-visited": "Not visited",
};

export function StatusDot({ status, className }: { status: ExamStatus; className?: string }) {
  return <span aria-label={examStatusLabel[status]} className={cn("inline-block size-2 rounded-full", bg[status], className)} />;
}

export function StatusPill({ status, children, className }: { status: ExamStatus; children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium", className)}>
      <StatusDot status={status} />
      {children ?? examStatusLabel[status]}
    </span>
  );
}
