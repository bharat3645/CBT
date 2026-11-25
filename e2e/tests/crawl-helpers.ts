import { type Page, expect } from "@playwright/test";

export interface PageReport { url: string; consoleErrors: string[]; badResponses: string[]; pageErrors: string[]; }

const IGNORE_CONSOLE = [/favicon/i, /Download the React DevTools/i, /\[Fast Refresh\]/i, /hydrat.*dev/i];

/** Attach listeners; returns a collector. `expected` status URLs (regex) are tolerated. */
export function watch(page: Page, expected: RegExp[] = []) {
  const rep = { consoleErrors: [] as string[], badResponses: [] as string[], pageErrors: [] as string[] };
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // browser logs "Failed to load resource" for every >=400, tracked via response listener instead
    if (/Failed to load resource/.test(t)) return;
    if (IGNORE_CONSOLE.some((r) => r.test(t))) return;
    rep.consoleErrors.push(t.slice(0, 300));
  });
  page.on("pageerror", (e) => rep.pageErrors.push(String(e).slice(0, 300)));
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const u = r.url();
    if (/_next\/static|hot-update|__nextjs/.test(u)) return;
    if (expected.some((x) => x.test(`${r.status()} ${u}`))) return;
    rep.badResponses.push(`${r.status()} ${r.request().method()} ${u}`);
  });
  return { rep, reset() { rep.consoleErrors.length = rep.badResponses.length = rep.pageErrors.length = 0; } };
}

export async function assertRendered(page: Page, label: string, quick = false) {
  if (quick) await page.waitForTimeout(150); else await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const body = (await page.locator("body").innerText()).trim();
  expect(body.length, `${label}: blank page`).toBeGreaterThan(20);
  expect(body, `${label}: error text`).not.toMatch(/Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error|Something went wrong/i);
  expect(await page.locator("nextjs-portal [data-nextjs-dialog], nextjs-portal [role=dialog]").count(), `${label}: next error overlay`).toBe(0);
}

const SKIP = /save|resolve|mark |archive|reactivate|activate|disable|delete|remove|sign ?out|log ?out|submit|cancel|suspend|deactivate|approve|release|publish|reject|discard|clear|reset|unlink|start|begin|resume|retry|download|export|upload|print|open (menu|sidebar)|toggle sidebar/i;

/** Click each harmless button/tab once; reload the page between if it navigated. Returns clicked labels. */
export async function clickAround(page: Page, label: string): Promise<string[]> {
  const url = page.url();
  const clicked: string[] = [];
  const names = await page.locator("main button:visible, main [role=tab]:visible, [role=main] button:visible").evaluateAll((els) =>
    els.map((e) => ((e as HTMLElement).innerText || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ")).filter(Boolean));
  const seen = new Set<string>();
  for (const name of names) {
    if (clicked.length >= 12 || seen.size >= 25) break;
    if (seen.has(name) || SKIP.test(name) || name.length > 60) continue;
    seen.add(name);
    const loc = page.locator("main button:visible, main [role=tab]:visible").filter({ hasText: name }).first();
    if (!(await loc.count()) || !(await loc.isEnabled().catch(() => false))) continue;
    try { await loc.click({ timeout: 1500 }); } catch { continue; }
    clicked.push(name);
        await assertRendered(page, `${label} after clicking "${name}"`, true);
    await page.keyboard.press("Escape");
    if (page.url() !== url) { await page.goto(url, { waitUntil: "networkidle" }); }
  }
  return clicked;
}
