import { ParentAttemptResultPage } from "@/features/parent/ParentPages";

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <ParentAttemptResultPage attemptId={attemptId} />;
}
