import { test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../apps/web/public/landing");
const SHOTS = process.env.SHOTS_DIR ?? path.resolve(OUT, "../../../../demo/screenshots");

/** Screens of the hosted demo (run with WEB_URL=http://localhost:3456). SHOTS_DIR overrides where they go. */
test("landing, login and role dashboards", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SHOTS, "d-landing.png"), fullPage: true });
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SHOTS, "d-login.png") });
  for (const [who, p, name] of [["admin", "/admin", "admin"], ["student", "/student/tests/results", "result"], ["teacher", "/teacher/attendance", "attendance"], ["parent", "/parent", "parent"]] as const) {
    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByRole("region", { name: "Demo accounts" }).getByRole("button", { name: new RegExp("^" + (who === "admin" ? "Institute admin" : who), "i") }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    await page.goto(p, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOTS, `d-${name}.png`) });
  }
});
