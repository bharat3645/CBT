import { TestLeaderboardPage } from "@/features/route-pages/result-pages";

export default async function Page({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  return <TestLeaderboardPage testId={testId} />;
}
