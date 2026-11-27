"use client";
import Link from "next/link";
import { LeaderboardView, ResultPage } from "@/features/results";
import { useMyResults } from "@/features/results/api";
import { PageHeader } from "@/components/dashboard-kit";
import { EmptyState, ErrorNote, Loading, Table, Td, fmtDateTime } from "@/components/ui-kit";

export function MyResultsPage() {
  const { data, isLoading, error } = useMyResults();
  return (
    <>
      <PageHeader title="Results" subtitle="Every released result, newest first. Open one for the full breakdown." />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorNote error={error} />
      ) : !data?.length ? (
        <EmptyState>No results yet. They appear here once your teacher releases them.</EmptyState>
      ) : (
        <Table head={["Test", "Score", "Percent", "Released"]}>
          {data.map((r) => {
            const pct = r.maxScore ? Math.round((r.score / r.maxScore) * 1000) / 10 : 0;
            return (
              <tr key={r.attemptId} className="transition-colors hover:bg-muted/60">
                <Td>
                  <Link href={`/student/tests/results/${r.attemptId}`} className="font-bold hover:underline">{r.title}</Link>
                </Td>
                <Td className="fig">{r.score} / {r.maxScore}</Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-muted sm:block">
                      <div className="fill-in h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                    </div>
                    <span className="fig text-sm">{pct}%</span>
                  </div>
                </Td>
                <Td className="text-muted-foreground">{fmtDateTime(r.evaluatedAt)}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}

export const AttemptResultPage = ({ attemptId }: { attemptId: string }) => <ResultPage attemptId={attemptId} />;

export const TestLeaderboardPage = ({ testId }: { testId: string }) => (
  <>
    <PageHeader title="Leaderboard" subtitle="Ranks for this test, computed once results are released." />
    <LeaderboardView testId={testId} />
  </>
);
