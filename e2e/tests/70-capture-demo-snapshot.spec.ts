import { test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { login } from "./helpers";

/**
 * Records the real API responses of the seeded demo stack, per role, into apps/web/public/demo/snapshot.json.
 * The Vercel demo (NEXT_PUBLIC_DEMO=1) replays this file in the browser, so the hosted demo shows real data with no backend.
 * Run: pnpm demo:reset, start the stack, then `playwright test tests/70-capture-demo-snapshot.spec.ts`.
 */
const OUT = path.resolve(__dirname, "../../apps/web/public/demo/snapshot.json");
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);

type Entry = { status: number; body: unknown };
const snapshot: { capturedAt: string; roles: Record<string, Record<string, Entry>>; practiceKey: Record<string, unknown>; practicePool: unknown[] } = {
  capturedAt: new Date().toISOString(), roles: {}, practiceKey: {}, practicePool: [],
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

const wanted: Record<string, Set<string>> = {};
/** Re-fetch every GET the pages asked for through the request API: page "response" events are lost when a navigation interrupts them. */
async function flush(page: Page, role: string) {
  const bucket = (snapshot.roles[role] ??= {});
  for (const key of wanted[role] ?? []) {
    if (bucket[key]) continue;
    const r = await page.request.get(key.replace(/^GET /, ""));
    try { bucket[key] = { status: r.status(), body: JSON.parse(await r.text()) }; } catch { /* non-JSON */ }
  }
}

function record(page: Page, role: string) {
  const bucket = (snapshot.roles[role] ??= {});
  const want = (wanted[role] ??= new Set());
  page.on("request", (rq) => {
    const u = new URL(rq.url());
    if (rq.method() === "GET" && u.pathname.startsWith("/api/v1/") && !/\/(report|export)|\.(pdf|csv)$/.test(u.pathname)) want.add(`GET ${u.pathname}${u.search}`);
  });
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/v1/") || u.pathname.startsWith("/api/v1/auth/") && r.request().method() === "GET" && false) return;
    if (/\.(pdf|csv)$/.test(u.pathname) || /\/(report|export)/.test(u.pathname)) return;
    try {
      const text = await r.text();
      const body = text ? JSON.parse(text) : null;
      bucket[`${r.request().method()} ${u.pathname}${u.search}`] = { status: r.status(), body };
    } catch { /* non-JSON */ }
  });
}

async function store(page: Page, role: string, method: "GET" | "POST", p: string, data?: unknown) {
  const url = `/api/v1${p}`;
  const r = method === "GET" ? await page.request.get(url) : await page.request.post(url, { headers: { origin: "http://localhost:3000" }, data });
  const text = await r.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  (snapshot.roles[role] ??= {})[`${method} ${url}`] = { status: r.status(), body };
  return body as any;
}

async function getJson(page: Page, p: string): Promise<any> {
  const r = await page.request.get(`/api/v1${p}`);
  return r.ok() ? r.json() : null;
}
async function visit(page: Page, paths: string[]) {
  const seen = new Set<string>();
  const queue = [...paths];
  while (queue.length && seen.size < 70) {
    const p = queue.shift()!;
    if (seen.has(p)) continue;
    seen.add(p);
    await page.goto(p, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(400);
    const hrefs = await page.locator("a[href^='/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
    for (const h of hrefs) {
      const clean = h.split("#")[0]!.split("?")[0]!.replace(/\/$/, "");
      if (clean && !clean.startsWith("/api") && !/\/exam\//.test(clean) && !seen.has(clean) && !queue.includes(clean)
        && queue.length + seen.size < 70) queue.push(clean);
    }
  }
}

test("admin", async ({ page }) => {
  await login(page, "admin");
  record(page, "admin");
  const batches = (await getJson(page, "/batches")) ?? [];
  const tests = (await getJson(page, "/tests")) ?? [];
  const papers = (await getJson(page, "/ingestion/papers")) ?? [];
  const qs = (await getJson(page, "/questions?limit=3"))?.items ?? [];
  const paths = ["/admin", "/admin/batches", "/admin/flags", "/admin/papers", "/admin/parents", "/admin/question-bank", "/admin/questions/new",
    "/admin/reports", "/admin/results", "/admin/settings", "/admin/students", "/admin/syllabus", "/admin/teachers", "/admin/tests"];
  for (const b of batches) paths.push(`/admin/batches/${b.id}`);
  for (const p of papers.slice(0, 4)) paths.push(`/admin/papers/${p.id}`);
  for (const q of qs) paths.push(`/admin/questions/${q.id}`);
  for (const t of tests.slice(0, 4)) paths.push(`/admin/tests/${t.id}/leaderboard`);
  await visit(page, paths);
});

test("teacher", async ({ page }) => {
  await login(page, "teacher");
  record(page, "teacher");
  const batches = (await getJson(page, "/batches")) ?? [];
  const tests = (await getJson(page, "/tests")) ?? [];
  const papers = (await getJson(page, "/ingestion/papers")) ?? [];
  const qs = (await getJson(page, "/questions?limit=3"))?.items ?? [];
  const paths = ["/teacher", "/teacher/attendance", "/teacher/feedback", "/teacher/batches", "/teacher/insights", "/teacher/papers/approved",
    "/teacher/papers/needs-review", "/teacher/papers/upload", "/teacher/question-bank", "/teacher/questions/new", "/teacher/syllabus", "/teacher/tests"];
  for (const b of batches) paths.push(`/teacher/batches/${b.id}`);
  for (const p of papers.slice(0, 4)) paths.push(`/teacher/papers/${p.id}`);
  for (const q of qs) paths.push(`/teacher/questions/${q.id}`);
  for (const t of tests.slice(0, 4)) paths.push(`/teacher/tests/${t.id}/leaderboard`);
  await visit(page, paths);
  // attendance rosters for every batch (today and a few earlier days) so the page works for any batch the viewer picks
  for (const b of batches) for (const d of [0, 1, 2]) {
    const date = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
    await page.request.get(`/api/v1/attendance/roster?batchId=${b.id}&date=${date}`);
  }
  await page.goto("/teacher/attendance", { waitUntil: "networkidle" });
  for (const b of batches) {
    await page.getByLabel("Batch").selectOption(b.id);
    await page.waitForTimeout(700);
  }
});

test("student (incl. live exam + practice keys)", async ({ page }) => {
  await login(page, "student");
  record(page, "student");
  const results = (await getJson(page, "/results/mine")) ?? [];
  const paths = ["/student", "/student/practice", "/student/syllabus", "/student/tests/upcoming", "/student/tests/results", "/student/weak-topics"];
  for (const r of results.slice(0, 4)) paths.push(`/student/tests/results/${r.attemptId}`, `/student/tests/${r.testId}/leaderboard`);
  await visit(page, paths);

  // practice: build a pool of questions plus their answer keys by checking a wrong answer (the API reveals the key)
  const topics = (await getJson(page, "/practice/topics")) ?? [];
  const pool = new Map<string, any>();
  for (let i = 0; i < 12 && pool.size < 60; i++) for (const q of (await getJson(page, "/practice/set?count=15")) ?? []) pool.set(q.id, q);
  for (const q of pool.values()) {
    const r = await page.request.post("/api/v1/practice/check", { headers: { origin: "http://localhost:3000" }, data: { questionId: q.id, answer: q.options ? "ZZ" : "-999999" } });
    if (r.ok()) snapshot.practiceKey[q.id] = await r.json();
  }
  snapshot.practicePool = [...pool.values()];
  void topics;

  // upcoming tests + the live exam, recorded through the request API (page events miss responses cut off by navigation)
  const upcoming = (await store(page, "student", "GET", "/tests/upcoming")) ?? [];
  const live = upcoming.find((t: any) => new Date(t.windowStart) <= new Date() && new Date(t.windowEnd) >= new Date()) ?? upcoming[0];
  if (live) {
    const attempt = await store(page, "student", "POST", `/tests/${live.id}/attempts`);
    const qs = await store(page, "student", "GET", `/attempts/${attempt.attemptId}/questions`);
    const first = qs[0];
    await store(page, "student", "POST", `/attempts/${attempt.attemptId}/answers`, { items: [{ questionId: first.id, seq: 1, status: "answered", value: { selected: first.options?.length ? [first.options[0].id] : [], numeric: null }, timeSpentMs: 4000 }] });
    await store(page, "student", "POST", `/attempts/${attempt.attemptId}/incidents`, { type: "tab_hidden", durationMs: 1200, occurredAt: new Date().toISOString() });
    await store(page, "student", "POST", `/attempts/${attempt.attemptId}/submit`);
  }
});

test("parent", async ({ page }) => {
  await login(page, "parent");
  record(page, "parent");
  const results = (await getJson(page, "/results/mine")) ?? [];
  const paths = ["/parent", "/parent/attendance", "/parent/feedback", "/parent/results", "/parent/syllabus"];
  for (const r of results.slice(0, 4)) paths.push(`/parent/results/${r.attemptId}`);
  await visit(page, paths);
});

test("super admin + public pages", async ({ page }) => {
  await page.context().clearCookies();
  record(page, "anon");
  for (const p of ["/", "/login", "/signup"]) await page.goto(p, { waitUntil: "networkidle" });
  await page.request.post("/api/v1/auth/sign-in/email", { headers: { origin: "http://localhost:3000" }, data: { email: "owner@cbt.local", password: "ChangeMe!12345" } });
  record(page, "super_admin");
  await page.goto("/superadmin", { waitUntil: "networkidle" });
  await page.goto("/superadmin/institutes", { waitUntil: "networkidle" });
});

test.afterEach(async ({ page }, info) => {
  const m = info.title.match(/^(admin|teacher|student|parent)/);
  if (m) await flush(page, m[1]!);
  if (info.title.startsWith("super admin")) await flush(page, "super_admin");
});

test.afterAll(() => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
    for (const [role, entries] of Object.entries(snapshot.roles)) prev.roles[role] = { ...(prev.roles[role] ?? {}), ...entries };
    if (!snapshot.practicePool.length) { snapshot.practicePool = prev.practicePool; snapshot.practiceKey = prev.practiceKey; }
    snapshot.roles = prev.roles;
  } catch { /* first capture */ }
  const text = JSON.stringify(snapshot);
  fs.writeFileSync(OUT, text);
  console.log(`snapshot: ${(text.length / 1024).toFixed(0)} KB, roles: ${Object.entries(snapshot.roles).map(([k, v]) => `${k}=${Object.keys(v).length}`).join(" ")}`);
  void UUID;
});
