import { BatchesPage } from "@/features/batches/BatchesPage";

export default function Page() {
  return <BatchesPage base="/teacher" canManage={false} />;
}
