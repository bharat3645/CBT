import { ParentAttemptResultPage } from "@/features/parent/parent-pages";

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <ParentAttemptResultPage attemptId={attemptId} />;
}
