"use client";

import { PaperList } from "@/features/mounts/paper-pages";

export default function Page() {
  return <PaperList title="Approved papers" filter={(p) => p.status === "approved"} />;
}
