import { BatchDetail } from "@/features/batches/batch-detail";

export default async function Page({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  return <BatchDetail id={batchId} base="/admin" canManage />;
}
