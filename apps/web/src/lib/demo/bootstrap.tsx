"use client";

import "./install";
import { IS_DEMO } from "./flag";

/** Slim notice so nobody mistakes the hosted demo for a live system. */
export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div role="note" className="fixed bottom-3 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-border bg-card/95 px-4 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
      Interactive demo with sample data. Changes live only in this browser tab.
    </div>
  );
}
