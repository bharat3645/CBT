import { test, expect, type Page } from "@playwright/test";
import { login, shot } from "./helpers";

const ORIGIN = { origin: "http://localhost:3000" };
let testId = "";
let attemptId = "";

test.describe.configure({ mode: "serial" });

test("setup: teacher publishes a test from the approved paper (API)", async ({ page }) => {
  await login(page, "teacher");
  const papers = await (await page.request.get("/api/v1/ingestion/papers")).json();
  const paper = papers.find((p: any) => p.status === "approved" && (p.title || p.filename).includes("JEE Mock Test 1"));
  expect(paper, "approved paper from 02-ingestion").toBeTruthy();
  const detail = await (await page.request.get(`/api/v1/ingestion/papers/${paper.id}`)).json();
  const bySection = new Map<string, string[]>();
  for (const d of [...detail.drafts].sort((a: any, b: any) => a.ordinal - b.ordinal)) {
    bySection.set(d.section ?? "General", [...(bySection.get(d.section ?? "General") ?? []), d.questionId]);
  }
  const res = await page.request.post("/api/v1/tests", {
    headers: ORIGIN,
    data: {
      title: `E2E Mock ${Date.now()}`, paperId: paper.id, presetKey: "nta", durationMinutes: 30,
      sections: [...bySection].map(([name, questionIds]) => ({ name, questionIds })),
      windowStart: new Date(Date.now() - 60_000).toISOString(), windowEnd: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
  testId = (await res.json()).id;
  const pub = await page.request.post(`/api/v1/tests/${testId}/publish`, { headers: ORIGIN });
  expect(pub.status(), await pub.text()).toBeLessThan(300);
});

async function openExam(page: Page) {
  page.on("response", async (r) => {
    if (/\/api\/v1\/tests\/[^/]+\/attempts$/.test(r.url()) && r.request().method() === "POST" && r.ok()) attemptId = (await r.json()).attemptId;
  });
  await page.goto(`/exam/${testId}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Start test" })).toBeVisible({ timeout: 30_000 });
}

test("student takes the live exam: timer, palette, autosave, strict mode, resume, submit", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "student");
  page.on("response", async (r) => {
    if (/\/attempts\/[^/]+\/answers$/.test(r.url())) console.log("autosave", r.status(), (await r.text()).slice(0, 220));
  });
  await openExam(page);
  await shot(page, "06-exam-instructions");
  await page.getByRole("button", { name: "Start test" }).click();

  // top bar: server-driven countdown
  await expect(page.getByText(/\b\d{2}:\d{2}:\d{2}\b/).first()).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Question palette" })).toBeVisible();
  await shot(page, "07-exam-q1");

  const radios = page.getByRole("radio");
  await radios.nth(2).check();                         // Q1 -> C (9 J) correct
  await page.getByRole("button", { name: "Save & Next" }).click();
  await radios.nth(1).check();                         // Q2 -> B wrong
  await page.getByRole("button", { name: "Save & Next" }).click();
  await expect(page.locator(".katex").first()).toBeVisible();   // Q3 maths rendered
  await shot(page, "08-exam-q3-math");
  await radios.nth(0).check();                         // Q3 -> A correct, marked for review
  await page.getByRole("button", { name: "Mark for Review & Next" }).click();
  await page.getByRole("button", { name: "Save & Next" }).click();   // Q4 left unanswered
  await radios.nth(0).check();                         // Q5 -> A correct
  await page.getByRole("button", { name: "Save & Next" }).click();

  const pal = page.getByRole("complementary", { name: "Question palette" });
  await expect(pal.getByRole("button", { name: /Question 1: Answered/i })).toBeVisible();
  await expect(pal.getByRole("button", { name: /Question 3: .*review/i })).toBeVisible();
  await expect(pal.getByRole("button", { name: /Question 4: Not answered/i })).toBeVisible();
  await shot(page, "09-exam-palette");

  // autosave reached the server
  await expect(page.getByText(/saved/i).first()).toBeVisible({ timeout: 15_000 });

  // strict mode: tab hidden -> incident posted
  const incident = page.waitForResponse((r) => /\/attempts\/[^/]+\/incidents$/.test(r.url()), { timeout: 15_000 });
  await page.evaluate(async () => {
    const setVis = (v: "hidden" | "visible") => {
      Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
      Object.defineProperty(document, "hidden", { value: v === "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    setVis("hidden");                       // student switches tab ...
    await new Promise((r) => setTimeout(r, 400));
    setVis("visible");                      // ... and comes back: incident is logged with the time away
  });
  expect((await incident).status()).toBeLessThan(300);
  await shot(page, "10-exam-strict-incident");

  // reload mid-exam: attempt resumes with the saved answers
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page.getByRole("complementary", { name: "Question palette" }).getByRole("button", { name: /Question 1: Answered/i })).toBeVisible({ timeout: 20_000 });
  await shot(page, "11-exam-resumed");

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(/submitted|receipt/i).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "12-exam-submitted");
  expect(attemptId).toMatch(/^[0-9a-f-]{36}$/);
});

test("evaluation: result page shows the NTA score (+4 x3, -1 x1 = 11/48), rank and report", async ({ page }) => {
  await login(page, "student");
  await page.goto(`/student/tests/results/${attemptId}`, { waitUntil: "domcontentloaded" });
  // the worker evaluates asynchronously after submit
  await expect(async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/11(\.0+)?\s*\/\s*48/).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000, intervals: [2_000] });
  await shot(page, "13-result");
});

test("PDF report downloads (Gotenberg) and the in-app notification is delivered", async ({ page }) => {
  await login(page, "student");
  await page.goto(`/student/tests/results/${attemptId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/11\s*\/\s*48/).first()).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("link", { name: /Download PDF report/ }).click(),
  ]);
  const file = await download.path();
  const fs = await import("node:fs");
  const head = fs.readFileSync(file!).subarray(0, 5).toString();
  expect(head).toBe("%PDF-");
  expect(fs.statSync(file!).size).toBeGreaterThan(5_000);

  const notes = await (await page.request.get("/api/v1/notifications")).json();
  expect(JSON.stringify(notes)).toMatch(/result/i);
  await shot(page, "14-result-pdf-and-notification");
});
