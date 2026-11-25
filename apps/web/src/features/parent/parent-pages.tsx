"use client";

import Link from "next/link";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Loading, Table, Td, fmtDateTime } from "@/components/ui-kit";
import { StudentAnalyticsView, ResultPage, useChildResults } from "@/features/results";
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
