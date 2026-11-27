"use client";

import "./install";
import { useState } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { IS_DEMO } from "./flag";

/** Slim notice so nobody mistakes the hosted demo for a live system. */
export function DemoBanner() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  if (!IS_DEMO || hidden || pathname.startsWith("/exam")) return null;
  return (
    <div role="note" className="stock fixed bottom-3 right-3 z-[60] flex max-w-[calc(100vw-24px)] items-center gap-2 py-1.5 pl-3 pr-1.5 text-xs font-semibold text-muted-foreground">
      <span className="size-2 shrink-0 rounded-full bg-sidebar-primary" aria-hidden />
      <span>
        Demo with sample data<span className="hidden sm:inline">. Changes stay in this browser tab.</span>
      </span>
      <button type="button" onClick={() => setHidden(true)} aria-label="Hide demo notice" className="rounded p-1 hover:bg-muted">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
