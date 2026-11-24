"use client";

import Link from "next/link";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Loading, PhaseCard, Table, Td, fmtDateTime } from "@/components/ui-kit";
import { StudentAnalyticsView, ResultPage, useChildResults } from "@/features/results";
import { useNotifications, useMarkAllRead } from "@/features/notifications/api";
import { Button } from "@cbt/ui";
import { useSelectedChild } from "./child";

function NoChild() {
  return <EmptyState>No child is linked to your account yet. Ask your institute to link your account to your child.</EmptyState>;
}

/** The linked child's RELEASED results (GET /results/mine?childId=) with the child's analytics below. */
export function ParentResultsPage() {
  const { child, isLoading } = useSelectedChild();
  const results = useChildResults(child?.userId);
  if (isLoading) return <Loading />;
  if (!child) {
    return (
      <>
        <PageHeader title="Results" />
        <NoChild />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Results" subtitle={`${child.name}'s released test results.`} />
      <div className="space-y-8">
        {results.isLoading ? (
          <Loading />
        ) : results.error ? (
          <ErrorNote error={results.error} />
        ) : !results.data?.length ? (
          <EmptyState>No results have been released for {child.name} yet.</EmptyState>
        ) : (
          <Table head={["Test", "Score", "Percent", "Evaluated"]}>
            {results.data.map((r) => (
              <tr key={r.attemptId}>
                <Td className="font-medium">
                  <Link href={`/parent/results/${r.attemptId}`} className="hover:underline">
                    {r.title}
                  </Link>
                </Td>
                <Td>
                  {r.score} / {r.maxScore}
                </Td>
                <Td>{r.maxScore ? `${Math.round((r.score / r.maxScore) * 1000) / 10}%` : "-"}</Td>
                <Td>{fmtDateTime(r.evaluatedAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
        <section>
          <h2 className="mb-3 text-sm font-semibold">Performance</h2>
          <StudentAnalyticsView studentUserId={child.userId} />
        </section>
      </div>
    </>
  );
}

export const ParentAttemptResultPage = ({ attemptId }: { attemptId: string }) => (
  <div className="space-y-3">
    <Link href="/parent/results" className="text-xs text-muted-foreground hover:underline">
      Back to results
    </Link>
    <ResultPage attemptId={attemptId} />
  </div>
);

/** Teacher feedback does not exist yet; what a parent really receives are notifications, so show those honestly. */
export function ParentFeedbackPage() {
  const list = useNotifications({ limit: 30 });
  const markAll = useMarkAllRead();
  const unread = (list.data ?? []).filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        title="Feedback and updates"
        subtitle="Messages from your institute about your child."
        actions={
          <Button variant="outline" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>
            Mark all read
          </Button>
        }
      />
      <div className="space-y-6">
        <PhaseCard title="Teacher feedback">
          Written feedback from teachers arrives in Phase 2. Until then, your institute&apos;s notices and result announcements appear below.
        </PhaseCard>
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorNote error={list.error} />
        ) : !list.data?.length ? (
          <EmptyState>No updates yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {list.data.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <div className={n.readAt ? "text-sm text-muted-foreground" : "text-sm font-medium"}>{n.title}</div>
                  {n.body && <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function AttendancePhasePage({ who }: { who: "parent" | "teacher" }) {
  return (
    <>
      <PageHeader title="Attendance" subtitle={who === "parent" ? "Your child's class attendance." : "Mark and review class attendance for your batches."} />
      <PhaseCard title="Attendance tracking">
        Attendance is planned for Phase 2. Nothing is recorded or shown here yet, and no attendance figures appear on any dashboard until it is real.
      </PhaseCard>
    </>
  );
}
