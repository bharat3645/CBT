import { test, expect } from "@playwright/test";
import { login, shot, SAMPLE_DOCX } from "./helpers";

test("teacher uploads a DOCX paper and it is parsed into question drafts", async ({ page }) => {
  await login(page, "teacher");
  await page.goto("/teacher/papers/upload", { waitUntil: "networkidle" });
  await page.getByLabel("Title").fill("JEE Mock Test 1");
  await page.getByLabel("Paper file").setInputFiles(SAMPLE_DOCX);
  await shot(page, "02-upload-form");
  await page.getByRole("button", { name: /Upload and convert/ }).click();
  await page.waitForURL(/\/teacher\/papers\/[0-9a-f-]{36}/, { timeout: 30_000 });
  // The worker parses asynchronously; the review editor shows drafts when status becomes "review".
  await expect(page.getByText(/A body of mass 2 kg/)).toBeVisible({ timeout: 60_000 });
  await shot(page, "03-review-editor");
});

test("teacher approves the paper and the 12 questions appear in the question bank with maths rendered", async ({ page }) => {
  await login(page, "teacher");
  await page.goto("/teacher/papers/needs-review", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "JEE Mock Test 1" }).first().click();
  await expect(page.getByText(/12 questions, 0 open flags, 0 without key/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Approve paper" }).click();
  await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "04-paper-approved");

  await page.goto("/teacher/question-bank", { waitUntil: "networkidle" });
  await expect(page.getByText(/body of mass 2 kg/i).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "05-question-bank");
});
