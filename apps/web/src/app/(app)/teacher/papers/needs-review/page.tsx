"use client";

import { PaperList } from "@/features/route-pages/paper-pages";

export default function Page() {
  return <PaperList title="Papers needing review" filter={(p) => p.status !== "approved" && p.status !== "rejected"} />;
}
