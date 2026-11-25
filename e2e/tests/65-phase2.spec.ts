import { test, expect } from "@playwright/test";
import { login, shot } from "./helpers";

// Phase 2 journey: teacher marks attendance + writes feedback -> parent sees both -> student practises.
// SLOW=1 adds a pause after each action so a human can follow along in a headed run.
const pause = (page: import("@playwright/test").Page, ms = 1200) => (process.env.SLOW ? page.waitForTimeout(ms) : Promise.resolve());
const FEEDBACK = `Great improvement in Physics this week (${Date.now().toString(36)}). Revise hybridisation next.`;

test("teacher marks attendance and sends feedback; parent sees both; student practises", async ({ page }) => {
  test.setTimeout(240_000);

  // --- teacher: attendance ---
  await login(page, "teacher");
  await page.goto("/teacher/attendance", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible();
  await expect(page.getByText("Phase 2")).toHaveCount(0);
  const select = page.getByLabel("Batch");
  await select.selectOption({ label: "JEE-2026-A" });
  await expect(page.getByRole("radiogroup").first()).toBeVisible();
  await page.getByRole("button", { name: "Mark all present" }).click();
  await pause(page);
  // mark the demo student absent
  const studentGroup = page.getByRole("radiogroup", { name: "Attendance for Demo Student" }).first();
  await studentGroup.getByRole("radio", { name: "absent" }).click();
  await pause(page);
  await shot(page, "65-attendance-marked");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText(/Saved attendance for \d+ students/)).toBeVisible();
  await pause(page);

  // --- teacher: feedback ---
  await page.goto("/teacher/feedback", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
  const students = page.getByLabel("Student");
  await students.selectOption((await students.locator("option", { hasText: "Demo Student" }).first().getAttribute("value"))!);
  await page.getByLabel("Feedback", { exact: true }).fill(FEEDBACK);
  await pause(page);
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Feedback sent.")).toBeVisible();
  await shot(page, "65-feedback-sent");
  await pause(page);

  // --- parent: sees attendance + feedback ---
  await login(page, "parent");
  await page.goto("/parent/attendance", { waitUntil: "networkidle" });
  await expect(page.getByText("Recent days")).toBeVisible();
  await shot(page, "65-parent-attendance");
  await pause(page, 2000);
  await page.goto("/parent/feedback", { waitUntil: "networkidle" });
  await expect(page.getByText("Phase 2")).toHaveCount(0);
  await expect(page.getByText(FEEDBACK).first()).toBeVisible();
  await shot(page, "65-parent-feedback");
  await pause(page, 2000);

  // --- student: practice ---
  await login(page, "student");
  await page.goto("/student/practice", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start practice" }).click();
  const cards = page.getByTestId("practice-question");
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });
  // the answer key must not be in the page's network payload: check one question
  const first = cards.first();
  const option = first.getByRole("button", { pressed: false }).first();
  if (await option.count()) await option.click();
  else await first.getByLabel("Numeric answer").fill("1");
  await pause(page);
  await first.getByRole("button", { name: "Check answer" }).click();
  await expect(first.getByText(/Correct|Incorrect/)).toBeVisible();
  await expect(page.getByTestId("practice-score")).toContainText("1 of");
  await shot(page, "65-practice");
  await pause(page, 2500);
});
