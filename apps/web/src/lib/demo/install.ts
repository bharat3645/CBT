import { IS_DEMO } from "./flag";

/**
 * Patches window.fetch once so every /api/v1 call is answered by the in-browser mock (hosted demo only).
 * Imported by api-client and auth-client, so it is in place before any request can be issued, whichever chunk loads first.
 * The mock itself is loaded lazily, and the whole branch is dead code in real builds (IS_DEMO is inlined at build time).
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
      const { handle } = await import("./mock-api");
      return await handle(realFetch, method, url, body || undefined);
    } catch (e) {
      console.error("[demo] mock failed", e);
      return new Response(JSON.stringify({ message: "Demo mock error" }), { status: 500, headers: { "content-type": "application/json" } });
    }
  };
}

if (IS_DEMO && typeof window !== "undefined") install();
