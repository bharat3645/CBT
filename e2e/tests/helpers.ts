import { type Page, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PASSWORD = "Passw0rd!Passw0rd";
export const SHOTS = path.resolve(__dirname, "../../demo/screenshots");
export const FLAWED_DOCX = path.resolve(__dirname, "../../demo/flawed-paper.docx");
export const SAMPLE_DOCX = path.resolve(__dirname, "../../demo/sample-paper.docx");

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

/** Dev servers hot-reload while code changes; wait until the API answers through the web proxy before acting. */
export async function waitForStack(page: Page, timeoutMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await page.request.get("/api/v1/health");
      if (r.ok()) return;
    } catch { /* not up yet */ }
    await page.waitForTimeout(1_000);
  }
  throw new Error("API did not become healthy");
}

export async function login(page: Page, role: "admin" | "teacher" | "student" | "parent") {
  // The dev API hot-reloads when files change, which can leave a sign-in request hanging: retry the form a few times.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await waitForStack(page);
    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill("#email", `${role}@demo.test`);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: attempt === 3 ? 30_000 : 12_000 });
      break;
    } catch (e) {
      if (attempt === 3) { await shot(page, "debug-login-stuck"); throw e; }
    }
  }
  await expect(page).not.toHaveURL(/login/);
}
