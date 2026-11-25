"use client";
import Link from "next/link";
import { LeaderboardView, ResultPage } from "@/features/results";
import { useMyResults } from "@/features/results/api";

export function MyResultsPage() {
  const { data, isLoading, error } = useMyResults();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Results</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p role="alert" className="text-sm">Could not load results.</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">No results yet.</p>
      ) : (
        <ul className="divide-y rounded border text-sm">
          {data.map((r) => (
            <li key={r.attemptId}>
              <Link href={`/student/tests/results/${r.attemptId}`} className="flex justify-between p-3 hover:bg-muted">
                <span>{r.title}</span>
                <span>{r.score} / {r.maxScore}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const AttemptResultPage = ({ attemptId }: { attemptId: string }) => <ResultPage attemptId={attemptId} />;

export const TestLeaderboardPage = ({ testId }: { testId: string }) => (
  <div className="space-y-4">
    <h1 className="text-xl font-semibold tracking-tight">Leaderboard</h1>
    <LeaderboardView testId={testId} />
  </div>
);
