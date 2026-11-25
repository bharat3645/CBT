import { AttemptResultPage } from "@/features/route-pages/result-pages";

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <AttemptResultPage attemptId={attemptId} />;
}
