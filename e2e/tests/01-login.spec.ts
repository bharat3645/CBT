import { test, expect } from "@playwright/test";
import { login, shot } from "./helpers";

for (const role of ["admin", "teacher", "student", "parent"] as const) {
  test(`login as ${role} lands on their dashboard`, async ({ page }) => {
    await login(page, role);
    await expect(page).toHaveURL(new RegExp(`/${role}`));
    await page.waitForLoadState("networkidle");
    await shot(page, `01-${role}-dashboard`);
  });
}
