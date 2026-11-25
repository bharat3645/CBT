"use client";

import { PaperList } from "@/features/route-pages/paper-pages";

export default function Page() {
  return <PaperList title="Flags" base="/admin" filter={(p) => p.openFlagCount > 0 || p.status === "failed"} />;
}
