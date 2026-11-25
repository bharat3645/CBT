import { PaperReviewPage } from "@/features/route-pages/paper-pages";

export default async function Page({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  return <PaperReviewPage paperId={paperId} />;
}
