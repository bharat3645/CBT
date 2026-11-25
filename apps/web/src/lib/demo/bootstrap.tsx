"use client";

import "./install";
import { usePathname } from "next/navigation";
import { IS_DEMO } from "./flag";

/** Slim notice so nobody mistakes the hosted demo for a live system. */
export function DemoBanner() {
  const pathname = usePathname();
  if (!IS_DEMO || pathname.startsWith("/exam")) return null;
  return (
    <div role="note" className="stock pointer-events-none fixed bottom-3 left-1/2 z-[60] -translate-x-1/2 px-4 py-1.5 text-xs text-muted-foreground">
      Interactive demo with sample data. Changes live only in this browser tab.
    </div>
  );
}
