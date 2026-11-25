"use client";

import { PaperList } from "@/features/route-pages/paper-pages";

export default function Page() {
  return <PaperList title="Papers" base="/admin" filter={() => true} />;
}
