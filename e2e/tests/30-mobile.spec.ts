import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

const PAGES: [string, string][] = [
  ["admin", "/admin"], ["admin", "/admin/papers"], ["admin", "/admin/people"],
  ["teacher", "/teacher"], ["teacher", "/teacher/tests"],
  ["student", "/student"], ["student", "/student/tests"],
];

for (const [role, path] of PAGES) {
  test(`mobile no h-overflow: ${role} ${path}`, async ({ page }) => {
    await login(page, role as any);
    await page.goto(path, { waitUntil: "networkidle" });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: `../demo/screenshots/mobile-${role}-${path.replace(/\//g, "_")}.png` });
    expect(over, `overflow px on ${path}`).toBeLessThanOrEqual(1);
  });
}
