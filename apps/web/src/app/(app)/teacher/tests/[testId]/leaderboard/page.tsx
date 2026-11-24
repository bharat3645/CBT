import { TestLeaderboardPage } from "@/features/mounts/result-pages";

export default async function Page({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  return <TestLeaderboardPage testId={testId} />;
}
