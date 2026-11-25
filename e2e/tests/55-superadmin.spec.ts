import { test, expect, type Page } from "@playwright/test";
import { PASSWORD, shot, waitForStack } from "./helpers";

const SA_EMAIL = "owner@cbt.local";
const SA_PASSWORD = "ChangeMe!12345";

async function loginAs(page: Page, email: string, password: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await waitForStack(page);
    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.getByRole("button", { name: "Log in" }).click();
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
      return;
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
}

test("self-serve signup -> super admin approves -> new admin uses an empty institute", async ({ page }) => {
  test.setTimeout(180_000);
  const id = Date.now().toString(36);
  const instName = `Sunrise Coaching ${id}`;
  const adminEmail = `owner-${id}@sunrise.test`;

  await waitForStack(page);
  await page.goto("/signup", { waitUntil: "networkidle" });
  await page.fill("#institute", instName);
  await page.fill("#name", "Asha Verma");
  await page.fill("#email", adminEmail);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("Registration received")).toBeVisible({ timeout: 30_000 });

  // super admin
  await loginAs(page, SA_EMAIL, SA_PASSWORD);
  await expect(page).toHaveURL(/\/superadmin/);
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
  await shot(page, "55-superadmin-overview");
  await page.goto("/superadmin/institutes", { waitUntil: "networkidle" });
  const row = page.locator(`[data-testid="institute-row"][data-name="${instName}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("pending");
  await expect(row).toContainText(adminEmail);
  await shot(page, "55-superadmin-institutes-pending");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toContainText("approved");
  await expect(row.getByRole("button", { name: "Suspend" })).toBeVisible();
  await shot(page, "55-superadmin-institutes-approved");

  // new institute admin
  await loginAs(page, adminEmail, PASSWORD);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText(/Application error|Something went wrong/i)).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText(/Good (morning|afternoon|evening)|Overview|Dashboard/i);
  await page.waitForTimeout(1500);
  await shot(page, "55-new-admin-empty-dashboard");

  await page.goto("/admin/batches", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "New batch" }).click();
  await page.getByLabel("Name").fill("Starter Batch");
  await page.getByRole("button", { name: /^(Create|Create batch|Save)$/ }).click();
  await expect(page.getByText("Starter Batch").first()).toBeVisible();
  await shot(page, "55-new-admin-batch-created");
});
