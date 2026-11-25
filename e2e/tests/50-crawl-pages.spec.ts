import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";
import { watch, assertRendered, clickAround } from "./crawl-helpers";

/** Visit every page for each role (dynamic ids discovered via the API), assert it renders, no console/network errors, and click harmless buttons. */
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

async function getJson(page: Page, p: string): Promise<any> {
  const r = await page.request.get(`/api/v1${p}`);
  return r.ok() ? r.json() : null;
}

async function crawl(page: Page, role: string, paths: string[]) {
  const w = watch(page);
  const problems: string[] = [];
  const visited = new Set(paths);
  const seenPatterns = new Set(paths.map((x) => x.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id")));
  const queue = [...paths];
  while (queue.length) {
    const p = queue.shift()!;
    if (visited.size > 80) break;
    w.reset();
    try {
      await page.goto(p, { waitUntil: "domcontentloaded" });
      await assertRendered(page, p);
      const clicked = await clickAround(page, p);
      console.log(`[${role}] ${p} ok (clicked ${clicked.length}: ${clicked.slice(0, 6).join(", ")})`);
      // follow every internal link on the page once (sidebar, cards, table links) so no link 404s
      const hrefs = await page.locator("a[href^='/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
      for (const h of hrefs) {
        const clean = h.split("#")[0]!.split("?")[0]!.replace(/\/$/, "") || "/";
        const pattern = clean.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id");
        if (!clean || clean.startsWith("/api") || visited.has(clean) || seenPatterns.has(pattern) || /\/exam\//.test(clean)) continue;
        visited.add(clean); seenPatterns.add(pattern); queue.push(clean);
      }
    } catch (e: any) { problems.push(`${p}: ${String(e.message).split("\n")[0]}`); }
    const all = [...w.rep.consoleErrors, ...w.rep.badResponses, ...w.rep.pageErrors];
    if (all.length) problems.push(`${p}: ${all.slice(0, 4).join(" | ")}`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
}

test("admin: every page", async ({ page }) => {
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
  await crawl(page, "admin", paths);
});

test("teacher: every page", async ({ page }) => {
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
  await crawl(page, "teacher", paths);
});

test("student: every page", async ({ page }) => {
  await login(page, "student");
  const res = (await getJson(page, "/results/mine")) ?? [];
  const paths = ["/student", "/student/practice", "/student/syllabus", "/student/tests/upcoming", "/student/tests/results",
    "/student/weak-topics"];
  if (res[0]) paths.push(`/student/tests/results/${res[0].attemptId}`, `/student/tests/${res[0].testId}/leaderboard`);
  await crawl(page, "student", paths);
});

test("parent: every page", async ({ page }) => {
  await login(page, "parent");
  const res = (await getJson(page, "/results/mine")) ?? [];
  const paths = ["/parent", "/parent/attendance", "/parent/feedback", "/parent/results", "/parent/syllabus"];
  if (res[0]) paths.push(`/parent/results/${res[0].attemptId}`);
  await crawl(page, "parent", paths);
});

test("auth + landing pages", async ({ page }) => {
  const w = watch(page);
  for (const p of ["/", "/login", "/signup"]) {
    await page.context().clearCookies();
    await page.goto(p, { waitUntil: "domcontentloaded" });
    await assertRendered(page, p);
  }
  expect([...w.rep.consoleErrors, ...w.rep.pageErrors, ...w.rep.badResponses]).toEqual([]);
});

test("unauthenticated app routes redirect to login; wrong role cannot see other role pages", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/admin", { waitUntil: "networkidle" });
  expect(new URL(page.url()).pathname).toMatch(/login/);
  await login(page, "student");
  await page.goto("/admin/settings", { waitUntil: "networkidle" });
  // the guard is client-side (redirects once /dashboard says which role this is), so poll instead of reading the URL once
  await expect.poll(() => new URL(page.url()).pathname, { message: "student must not stay on admin page", timeout: 20_000 }).not.toBe("/admin/settings");
});
