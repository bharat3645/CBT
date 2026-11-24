import { test, expect } from "@playwright/test";
import { login, shot } from "./helpers";

// Needs the demo dataset: an approved paper "JEE Mock Test 1" (02-ingestion) and demo batch JEE-2026-A with the demo student.
const ORIGIN = { origin: "http://localhost:3000" };
const OTHER_BATCH = "E2E Other Batch";
const title = `E2E Assigned ${Date.now()}`;
const otherTitle = `E2E Other Batch Only ${Date.now()}`;

let testId = "";
let otherTestId = "";
let paperId = "";
let sections: { name: string; questionIds: string[] }[] = [];

test.describe.configure({ mode: "serial" });

test("teacher publishes a test for the demo batch through the wizard", async ({ page }) => {
  await login(page, "teacher");

  // sections of the approved paper, reused later when the admin creates a second test through the API
  const papers = await (await page.request.get("/api/v1/ingestion/papers")).json();
  const paper = papers.find((p: any) => p.status === "approved" && (p.title || p.filename).includes("JEE Mock Test 1"));
  expect(paper, "approved paper from 02-ingestion").toBeTruthy();
  paperId = paper.id;
  const detail = await (await page.request.get(`/api/v1/ingestion/papers/${paper.id}`)).json();
  const by = new Map<string, string[]>();
  for (const d of [...detail.drafts].sort((a: any, b: any) => a.ordinal - b.ordinal)) {
    if (d.questionId) by.set(d.section ?? "General", [...(by.get(d.section ?? "General") ?? []), d.questionId]);
  }
  sections = [...by].map(([name, questionIds]) => ({ name, questionIds }));

  await page.goto("/teacher/tests", { waitUntil: "networkidle" });
  await expect(page.getByPlaceholder("Test title")).toBeVisible({ timeout: 30_000 });

  // step 1: paper, title, batches
  const value = await page.locator('select[aria-label="Paper"] option', { hasText: "JEE Mock Test 1" }).first().getAttribute("value");
  await page.getByLabel("Paper").selectOption(value!);
  await page.getByPlaceholder("Test title").fill(title);
  await page.getByRole("checkbox", { name: /JEE-2026-A/ }).check();
  const other = page.getByRole("checkbox", { name: new RegExp(OTHER_BATCH) });
  if (await other.count()) await other.uncheck();
  await shot(page, "20-wizard-batches");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // step 2: preset (default NTA). step 3: schedule keeps the default window (now .. +7d); shorten the exam to 10 minutes
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Duration (minutes)").fill("10");
  await expect(page.getByLabel("Window opens")).not.toHaveValue("");
  await expect(page.getByLabel("Window closes")).not.toHaveValue("");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(/JEE-2026-A/).first()).toBeVisible(); // review names the batch
  await page.getByRole("button", { name: "Publish test" }).click();

  const created = page.getByTestId("created-test-id");
  await expect(created).toBeVisible({ timeout: 30_000 });
  testId = (await created.textContent())!.trim();
  expect(testId).toMatch(/^[0-9a-f-]{36}$/);

  // the list under the wizard shows it with its batch and an open window
  const row = page.getByRole("row", { name: new RegExp(title) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("JEE-2026-A");
  await expect(row).toContainText("Open now");
  await shot(page, "21-teacher-tests-list");

  // API view of the same test
  const list = await (await page.request.get("/api/v1/tests")).json();
  const mine = list.find((t: any) => t.id === testId);
  expect(mine).toMatchObject({ title, status: "published", windowState: "open", durationMinutes: 10, attemptCount: 0 });
  expect(mine.batches.map((b: any) => b.name)).toEqual(["JEE-2026-A"]);
});

test("student sees the test under Upcoming and can open it", async ({ page }) => {
  await login(page, "student");
  await page.goto("/student/tests/upcoming", { waitUntil: "networkidle" });
  const card = page.getByTestId("upcoming-test").filter({ hasText: title });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("10 min");
  await shot(page, "22-student-upcoming");

  await card.getByRole("link", { name: "Start test" }).click();
  await page.waitForURL(new RegExp(`/exam/${testId}$`), { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Start test" })).toBeVisible({ timeout: 30_000 }); // instructions screen

  // an attempt now exists: the list offers Resume
  await page.goto("/student/tests/upcoming", { waitUntil: "networkidle" });
  const again = page.getByTestId("upcoming-test").filter({ hasText: title });
  await expect(again.getByRole("link", { name: "Resume" })).toBeVisible({ timeout: 30_000 });
  const mine = (await (await page.request.get("/api/v1/tests/upcoming")).json()).find((t: any) => t.id === testId);
  expect(mine).toMatchObject({ attemptState: "in_progress", resultAvailable: false, canStart: true });
  expect(mine.attemptId).toMatch(/^[0-9a-f-]{36}$/);
});

test("admin assigns a second test to a batch the student is not in", async ({ page }) => {
  await login(page, "admin");
  let batches: any[] = await (await page.request.get("/api/v1/batches")).json();
  let other = batches.find((b) => b.name === OTHER_BATCH);
  if (!other) {
    const res = await page.request.post("/api/v1/batches", { headers: ORIGIN, data: { name: OTHER_BATCH, year: 2026 } });
    expect(res.status(), await res.text()).toBeLessThan(300);
    other = await res.json();
  }
  const created = await page.request.post("/api/v1/tests", {
    headers: ORIGIN,
    data: {
      title: otherTitle, paperId, batchIds: [other.id], presetKey: "nta", durationMinutes: 10, sections,
      windowStart: new Date(Date.now() - 60_000).toISOString(), windowEnd: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  });
  expect(created.status(), await created.text()).toBeLessThan(300);
  otherTestId = (await created.json()).id;
  const pub = await page.request.post(`/api/v1/tests/${otherTestId}/publish`, { headers: ORIGIN });
  expect(pub.status(), await pub.text()).toBeLessThan(300);

  // the admin's Tests page lists both tests
  await page.goto("/admin/tests", { waitUntil: "networkidle" });
  await expect(page.getByRole("row", { name: new RegExp(title) })).toBeVisible({ timeout: 30_000 });
  const otherRow = page.getByRole("row", { name: new RegExp(otherTitle) });
  await expect(otherRow).toBeVisible();
  await expect(otherRow).toContainText(OTHER_BATCH);
  await shot(page, "23-admin-tests-list");
});

test("a student outside the batch cannot see or start the test (403)", async ({ page }) => {
  await login(page, "student");

  const upcoming: any[] = await (await page.request.get("/api/v1/tests/upcoming")).json();
  expect(upcoming.map((t) => t.id)).toContain(testId);
  expect(upcoming.map((t) => t.id)).not.toContain(otherTestId);

  const denied = await page.request.post(`/api/v1/tests/${otherTestId}/attempts`, { headers: ORIGIN });
  expect(denied.status(), await denied.text()).toBe(403);

  // the assigned test still resumes for the enrolled student
  const ok = await page.request.post(`/api/v1/tests/${testId}/attempts`, { headers: ORIGIN });
  expect(ok.status(), await ok.text()).toBeLessThan(300);

  // and the exam screen refuses to load the other test
  await page.goto(`/exam/${otherTestId}`, { waitUntil: "networkidle" });
  await expect(page.getByText(/could not load the test/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Start test" })).toHaveCount(0);
});
