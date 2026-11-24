import { EditQuestionPage } from "@/features/mounts/question-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditQuestionPage base="/teacher" questionId={id} />;
}
