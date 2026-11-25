import { test, expect, type Page } from "@playwright/test";
import { shot } from "./helpers";

/**
 * Smoke test for the HOSTED DEMO build (no backend). Run against it with:
 *   WEB_URL=http://localhost:3100 playwright test tests/71-demo-smoke.spec.ts
 * Signs in through the real login form and walks each role's key pages and the interactive flows.
 */
const PW = "Passw0rd!Passw0rd";
const BAD = /Application error|Unhandled Runtime Error|could not be found|Something went wrong|not part of the demo snapshot/i;

async function signIn(page: Page, email: string, pw = PW) {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
}
async function open(page: Page, p: string) {
  await page.goto(p, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const t = await page.locator("body").innerText();
  expect(t.length, `${p} blank`).toBeGreaterThan(30);
  expect(t, `${p} error text`).not.toMatch(BAD);
}

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", "admin@demo.test");
  await page.fill("#password", "wrong-password-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/invalid/i)).toBeVisible();
});

test("admin pages", async ({ page }) => {
  await signIn(page, "admin@demo.test");
  expect(new URL(page.url()).pathname).toBe("/admin");
  for (const p of ["/admin", "/admin/batches", "/admin/students", "/admin/teachers", "/admin/parents", "/admin/papers", "/admin/flags",
    "/admin/question-bank", "/admin/syllabus", "/admin/tests", "/admin/results", "/admin/reports", "/admin/settings"]) await open(page, p);
  await page.goto("/admin", { waitUntil: "networkidle" });
  await shot(page, "demo-admin");
});

test("teacher: attendance + feedback persist in the session", async ({ page }) => {
  await signIn(page, "teacher@demo.test");
  for (const p of ["/teacher", "/teacher/batches", "/teacher/papers/approved", "/teacher/papers/needs-review", "/teacher/question-bank", "/teacher/tests", "/teacher/insights", "/teacher/syllabus"]) await open(page, p);
  await open(page, "/teacher/attendance");
  await page.getByLabel("Batch").selectOption({ label: "JEE-2026-A" });
  await expect(page.getByRole("radiogroup").first()).toBeVisible();
  await page.getByRole("button", { name: "Mark all present" }).click();
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText(/Saved attendance for \d+ students/)).toBeVisible();
  await open(page, "/teacher/feedback");
  await page.getByLabel("Feedback", { exact: true }).fill("Demo feedback from the hosted demo.");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Feedback sent.")).toBeVisible();
  await expect(page.getByText("Demo feedback from the hosted demo.").first()).toBeVisible();
});

test("student: pages, practice, live exam", async ({ page }) => {
  await signIn(page, "student@demo.test");
  for (const p of ["/student", "/student/tests/upcoming", "/student/tests/results", "/student/weak-topics", "/student/syllabus"]) await open(page, p);
  await open(page, "/student/practice");
  await page.getByRole("button", { name: "Start practice" }).click();
  const first = page.getByTestId("practice-question").first();
  await expect(first).toBeVisible();
  const opt = first.getByRole("button", { pressed: false }).first();
  if (await opt.count()) await opt.click(); else await first.getByLabel("Numeric answer").fill("1");
  await first.getByRole("button", { name: "Check answer" }).click();
  await expect(first.getByText(/Correct|Incorrect/)).toBeVisible();
  // results detail
  await page.goto("/student/tests/results", { waitUntil: "networkidle" });
  await page.locator("a[href*='/student/tests/results/']").first().click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).not.toContainText(BAD);
  // live exam
  await page.goto("/student/tests/upcoming", { waitUntil: "networkidle" });
  const start = page.locator("a[href^='/exam/']").first();
  await expect(start).toBeVisible();
  await start.click();
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page.getByRole("complementary", { name: "Question palette" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible({ timeout: 15_000 });
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(/submitted|receipt/i).first()).toBeVisible({ timeout: 20_000 });
  await shot(page, "demo-exam-submitted");
});

test("parent and super admin", async ({ page }) => {
  await signIn(page, "parent@demo.test");
  for (const p of ["/parent", "/parent/results", "/parent/attendance", "/parent/feedback", "/parent/syllabus"]) await open(page, p);
  await signIn(page, "owner@cbt.local", "ChangeMe!12345");
  for (const p of ["/superadmin", "/superadmin/institutes"]) await open(page, p);
});
