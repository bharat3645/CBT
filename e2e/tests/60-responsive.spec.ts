import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { login, SHOTS } from "./helpers";

/** Every page at phone (390) and tablet (768): no horizontal page overflow. Screenshots (390 only) for a subset. */
test.setTimeout(900_000);

const ORIGIN = { origin: "http://localhost:3000" };
const SIZES = [{ width: 390, height: 844 }, { width: 768, height: 1024 }];
const KEY = new Set([
  "/admin", "/admin/papers", "/admin/students", "/admin/batches", "/teacher", "/teacher/tests", "/teacher/question-bank",
  "/student", "/student/tests/upcoming", "/student/tests/results", "/parent", "/parent/results", "/teacher/papers/:id", "/login",
]);

async function getJson(page: Page, p: string): Promise<any> {
  const r = await page.request.get(`/api/v1${p}`);
  return r.ok() ? r.json() : null;
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const pattern = (p: string) => p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id");

async function sweep(page: Page, role: string, paths: string[]) {
  const problems: string[] = [];
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const p of paths) {
      await page.goto(p, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await page.getByText(/^Loading/).first().waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);
      const over = await overflow(page);
      const pat = pattern(p);
      if (size.width === 390 && KEY.has(pat)) {
        await page.screenshot({ path: path.join(SHOTS, `resp-${role}-${pat.replace(/[/:]+/g, "_").replace(/^_/, "")}.png`) });
      }
      if (over > 1) problems.push(`${role} ${p} @${size.width}: +${over}px`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
}

test("admin pages", async ({ page }) => {
  await login(page, "admin");
  const tests = (await getJson(page, "/tests")) ?? [];
  const batches = (await getJson(page, "/batches")) ?? [];
  const papers = (await getJson(page, "/ingestion/papers")) ?? [];
  const qs = (await getJson(page, "/questions?limit=3"))?.items ?? [];
  const paths = ["/admin", "/admin/batches", "/admin/flags", "/admin/papers", "/admin/parents", "/admin/question-bank",
    "/admin/questions/new", "/admin/reports", "/admin/results", "/admin/settings", "/admin/students", "/admin/syllabus",
    "/admin/teachers", "/admin/tests"];
  if (batches[0]) paths.push(`/admin/batches/${batches[0].id}`);
  if (papers[0]) paths.push(`/admin/papers/${papers[0].id}`);
  if (qs[0]) paths.push(`/admin/questions/${qs[0].id}`);
  if (tests[0]) paths.push(`/admin/tests/${tests[0].id}/leaderboard`);
  await sweep(page, "admin", paths);
});

test("teacher pages", async ({ page }) => {
  await login(page, "teacher");
  const tests = (await getJson(page, "/tests")) ?? [];
  const batches = (await getJson(page, "/batches")) ?? [];
  const papers = (await getJson(page, "/ingestion/papers")) ?? [];
  const qs = (await getJson(page, "/questions?limit=3"))?.items ?? [];
  const paths = ["/teacher", "/teacher/attendance", "/teacher/batches", "/teacher/insights", "/teacher/papers/approved",
    "/teacher/papers/needs-review", "/teacher/papers/upload", "/teacher/question-bank", "/teacher/questions/new",
    "/teacher/syllabus", "/teacher/tests"];
  if (batches[0]) paths.push(`/teacher/batches/${batches[0].id}`);
  if (papers[0]) paths.push(`/teacher/papers/${papers[0].id}`);
  if (qs[0]) paths.push(`/teacher/questions/${qs[0].id}`);
  if (tests[0]) paths.push(`/teacher/tests/${tests[0].id}/leaderboard`);
  await sweep(page, "teacher", paths);
});

test("student pages", async ({ page }) => {
  await login(page, "student");
  const res = (await getJson(page, "/results/mine")) ?? [];
  const paths = ["/student", "/student/practice", "/student/syllabus", "/student/tests/upcoming", "/student/tests/results", "/student/weak-topics"];
  if (res[0]) paths.push(`/student/tests/results/${res[0].attemptId}`, `/student/tests/${res[0].testId}/leaderboard`);
  await sweep(page, "student", paths);
});

test("parent pages", async ({ page }) => {
  await login(page, "parent");
  const res = (await getJson(page, "/results/mine")) ?? [];
  const paths = ["/parent", "/parent/attendance", "/parent/feedback", "/parent/results", "/parent/syllabus"];
  if (res[0]) paths.push(`/parent/results/${res[0].attemptId}`);
  await sweep(page, "parent", paths);
});

test("auth pages", async ({ page }) => {
  const problems: string[] = [];
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const p of ["/", "/login", "/signup"]) {
      await page.context().clearCookies();
      await page.goto(p, { waitUntil: "networkidle" });
      if (size.width === 390 && p === "/login") await page.screenshot({ path: path.join(SHOTS, "resp-login.png") });
      const o = await overflow(page);
      if (o > 1) problems.push(`${p} @${size.width}: +${o}px`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("sidebar is a drawer on phone", async ({ page }) => {
  await login(page, "teacher");
  await page.setViewportSize(SIZES[0]!);
  await page.goto("/teacher", { waitUntil: "networkidle" });
  const aside = page.locator("aside").first();
  const inView = async () => { const b = await aside.boundingBox(); return !!b && b.x + b.width > 8 && b.x < 390; };
  expect(await inView(), "drawer closed at first").toBeFalsy();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect.poll(inView, { timeout: 10_000 }).toBeTruthy();
  await page.screenshot({ path: path.join(SHOTS, "resp-sidebar-drawer.png") });
  await aside.getByRole("link", { name: "Tests" }).click();
  await page.waitForURL(/\/teacher\/tests/);
  await expect.poll(inView, { timeout: 10_000 }).toBeFalsy();
});

test("live exam usable on phone and tablet", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  for (const size of SIZES) {
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
    await login(page, "teacher");
    const papers = (await getJson(page, "/ingestion/papers")) ?? [];
    const paper = papers.find((p: any) => p.status === "approved");
    expect(paper, "an approved paper").toBeTruthy();
    const detail = await (await page.request.get(`/api/v1/ingestion/papers/${paper.id}`)).json();
    const ids = [...detail.drafts].sort((a: any, b: any) => a.ordinal - b.ordinal).map((d: any) => d.questionId);
    const res = await page.request.post("/api/v1/tests", {
      headers: ORIGIN,
      data: {
        title: `Resp Exam ${Date.now()}`, paperId: paper.id, presetKey: "nta", durationMinutes: 30,
        sections: [{ name: "General", questionIds: ids }],
        windowStart: new Date(Date.now() - 60_000).toISOString(), windowEnd: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      },
    });
    expect(res.status(), await res.text()).toBeLessThan(300);
    const testId = (await res.json()).id;
    expect((await page.request.post(`/api/v1/tests/${testId}/publish`, { headers: ORIGIN })).status()).toBeLessThan(300);
    await login(page, "student");
    await page.setViewportSize(size);
    await page.goto(`/exam/${testId}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Start test" })).toBeVisible({ timeout: 30_000 });
    expect(await overflow(page), `instructions @${size.width}`).toBeLessThanOrEqual(1);
    if (size.width === 390) await page.screenshot({ path: path.join(SHOTS, "resp-exam-instructions.png") });
    await page.getByRole("button", { name: "Start test" }).click();
    await expect(page.getByText(/\b\d{2}:\d{2}:\d{2}\b/).first()).toBeVisible({ timeout: 30_000 });
    expect(await overflow(page), `exam @${size.width}`).toBeLessThanOrEqual(1);
    if (size.width === 390) await page.screenshot({ path: path.join(SHOTS, "resp-exam-q1.png") });

    // options tappable
    const radio = page.getByRole("radio").first();
    await radio.scrollIntoViewIfNeeded();
    const box = await page.locator("label:has(input[type=radio])").first().boundingBox();
    expect(box && box.height >= 24, "option tap target").toBeTruthy();
    await radio.click();
    // palette reachable: visible directly, or via a toggle button
    let pal = page.getByRole("complementary", { name: "Question palette" });
    if (!(await pal.isVisible())) {
      await page.getByRole("button", { name: "Palette", exact: true }).click();
    }
    await expect(pal).toBeVisible();
    if (size.width === 390) await page.screenshot({ path: path.join(SHOTS, "resp-exam-palette.png") });
    if (size.width < 768) await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Save & Next" }).first().click();
    // submit reachable
    const submit = page.getByRole("button", { name: /^submit/i }).first();
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeVisible();
    const vp = page.viewportSize()!;
    const sb = (await submit.boundingBox())!;
    expect(sb.x >= 0 && sb.x + sb.width <= vp.width + 1, "submit within viewport width").toBeTruthy();
    await submit.click();
  }
});
