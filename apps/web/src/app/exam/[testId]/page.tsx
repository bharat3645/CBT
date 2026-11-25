import { ExamClient } from "@/features/route-pages/exam-page";

// The route param is the test id: starting an attempt is idempotent and resumes the existing one.
export default async function ExamPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  return <ExamClient testId={testId} />;
}
