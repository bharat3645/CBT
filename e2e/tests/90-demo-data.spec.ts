import { test, expect } from "@playwright/test";
import { login, shot } from "./helpers";

/** After `pnpm demo:reset`: each role's home page shows real numbers, not an empty state. */
const EXPECT: Record<string, RegExp> = {
  admin: /Demo Academy|Students|25/,
  teacher: /JEE-2026-A/,
  student: /JEE Main Mock 2/,
  parent: /JEE Main Mock 2/,
};

for (const role of ["admin", "teacher", "student", "parent"] as const) {
  test(`demo data: ${role} home is populated`, async ({ page }) => {
    await login(page, role);
    await expect(page).toHaveURL(new RegExp(`/${role}`));
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(EXPECT[role]!);
    await shot(page, `90-demo-${role}-home`);
  });
}
