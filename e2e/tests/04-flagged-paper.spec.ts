import { test, expect, type Page } from "@playwright/test";
import { login, shot, FLAWED_DOCX } from "./helpers";

const row = (page: Page, n: number) => page.locator("li").filter({ has: page.locator("b", { hasText: new RegExp(`^Q${n}$`) }) });

test("messy paper: flags appear, approval is blocked (422), teacher fixes them, approval succeeds", async ({ page }) => {
  await login(page, "teacher");
  await page.goto("/teacher/papers/upload", { waitUntil: "networkidle" });
  await page.getByLabel("Title").fill(`Messy Chemistry Quiz ${Date.now()}`);
  await page.getByLabel("Paper file").setInputFiles(FLAWED_DOCX);
  await page.getByRole("button", { name: /Upload and convert/ }).click();
  await page.waitForURL(/\/teacher\/papers\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(row(page, 4)).toBeVisible({ timeout: 60_000 });

  // flags surfaced by the segmenter
  await expect(row(page, 2).getByText(/option/i).first()).toBeVisible();
  await expect(row(page, 3).getByText(/option/i).first()).toBeVisible();
  await expect(page.getByText(/4 questions, [1-9]\d* open flags?/)).toBeVisible();
  await shot(page, "15-flagged-paper");

  // gate: cannot approve with open flags / missing answers
  await page.getByRole("button", { name: "Approve paper" }).click();
  await expect(page.getByText("Cannot approve:")).toBeVisible({ timeout: 15_000 });
  await shot(page, "16-approval-blocked-422");

  // fix Q2: key = B, resolve flag
  await row(page, 2).getByRole("button", { name: "Key" }).nth(1).click();
  await row(page, 2).getByRole("button", { name: "Mark resolved" }).click();
  // fix Q3: numeric answer, resolve flag
  await row(page, 3).getByPlaceholder("Numeric answer").fill("44");
  await row(page, 3).getByPlaceholder("Numeric answer").blur();
  await row(page, 3).getByRole("button", { name: "Mark resolved" }).click();

  await expect(page.getByText(/4 questions, 0 open flags, 0 without key/)).toBeVisible({ timeout: 20_000 });
  await shot(page, "17-flags-fixed");
  await page.getByRole("button", { name: "Approve paper" }).click();
  await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Cannot approve:")).toHaveCount(0);
  await shot(page, "18-messy-paper-approved");
});
