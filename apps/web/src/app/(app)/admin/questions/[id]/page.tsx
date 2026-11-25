import { EditQuestionPage } from "@/features/route-pages/question-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditQuestionPage base="/admin" questionId={id} />;
}
