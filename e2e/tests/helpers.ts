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
  await waitForStack(page);
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", `${role}@demo.test`);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForTimeout(1500);
  if (new URL(page.url()).pathname.startsWith("/login")) await shot(page, "debug-login-stuck");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  await expect(page).not.toHaveURL(/login/);
}
