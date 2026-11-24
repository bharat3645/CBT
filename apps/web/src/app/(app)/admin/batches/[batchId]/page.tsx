import { BatchDetail } from "@/features/batches/BatchDetail";

export default async function Page({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  return <BatchDetail id={batchId} base="/admin" canManage />;
}
