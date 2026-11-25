"use client";

import { IS_DEMO } from "./flag";
import { handle } from "./mock-api";


/**
 * Patches window.fetch once so every /api/v1 call is answered by the in-browser mock.
 * Runs at module load (before any component fetches), and only in the browser.
 */
function install() {
  const w = window as unknown as { __demoInstalled?: boolean };
  if (w.__demoInstalled) return;
  w.__demoInstalled = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req?.url ?? String(input), window.location.origin);
    if (!url.pathname.startsWith("/api/v1")) return realFetch(input, init);
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : req ? await req.clone().text() : undefined;
    try {
      return await handle(realFetch, method, url, body || undefined);
    } catch (e) {
      console.error("[demo] mock failed", e);
      return new Response(JSON.stringify({ message: "Demo mock error" }), { status: 500, headers: { "content-type": "application/json" } });
    }
  };
}
if (IS_DEMO && typeof window !== "undefined") install();

/** Slim notice so nobody mistakes the hosted demo for a live system. */
export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div role="note" className="fixed bottom-3 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-border bg-card/95 px-4 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
      Interactive demo with sample data. Changes live only in this browser tab.
    </div>
  );
}
