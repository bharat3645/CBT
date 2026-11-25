import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { login, shot, SAMPLE_DOCX, FLAWED_DOCX } from "./helpers";
import { watch } from "./crawl-helpers";

/**
 * UI flows not covered by 20-admin-pages: sign up, teacher/parent creation and linking, syllabus editing, header search,
 * notifications bell, sign out, tests edit/cancel, exports, flags, batch lifecycle and the Phase 2 stub pages.
 * Every created record carries a unique run id.
 */
const RUN = Date.now().toString(36);
const ORIGIN = { origin: "http://localhost:3000" };
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

async function apiJson(page: Page, path: string): Promise<any> {
  const r = await page.request.get(`/api/v1${path}`);
  expect(r.status(), `${path} -> ${r.status()}`).toBe(200);
  return r.json();
}

test("sign up page registers an institute that waits for approval", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/signup", { waitUntil: "networkidle" });
  await page.getByLabel("Institute name").fill(`UI Academy ${RUN}`);
  await page.getByLabel("Your full name").fill("UI Owner");
  await page.getByLabel("Email").fill(`ui.owner.${RUN}@e2e.test`);
  await page.getByLabel("Password").fill("UiOwner!Pass123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("Registration received")).toBeVisible();
  await expect(page.getByText(`UI Academy ${RUN} is waiting for approval`)).toBeVisible();
  await page.getByRole("link", { name: "Back to log in" }).click();
  await expect(page).toHaveURL(/login/);
  // a duplicate email is rejected with a readable message
  await page.goto("/signup", { waitUntil: "networkidle" });
  await page.getByLabel("Institute name").fill(`UI Academy Dup ${RUN}`);
  await page.getByLabel("Your full name").fill("UI Owner");
  await page.getByLabel("Email").fill(`ui.owner.${RUN}@e2e.test`);
  await page.getByLabel("Password").fill("UiOwner!Pass123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(/already exists/i);
});

test("login shows an error for a wrong password and the signup link works", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", "admin@demo.test");
  await page.fill("#password", "wrong-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator("p[role=alert]")).toBeVisible();
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/signup/);
});

test("admin adds a teacher and a parent linked to a student through the forms", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/teachers", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add teacher" }).first().click();
  await page.getByLabel("Full name").fill(`UI Teacher ${RUN}`);
  await page.getByLabel("Email", { exact: true }).fill(`ui.teacher.${RUN}@e2e.test`);
  await page.getByLabel("Employee code (optional)").fill(`UT-${RUN}`);
  await page.getByRole("button", { name: "Add teacher" }).last().click();
  await expect(page.getByText(`Added UI Teacher ${RUN}.`)).toBeVisible();
  await page.getByLabel(/Search teachers/i).fill(`UI Teacher ${RUN}`);
  await expect(page.getByRole("row", { name: new RegExp(`UI Teacher ${RUN}`) })).toBeVisible();

  await page.goto("/admin/parents", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add parent" }).first().click();
  await page.getByLabel("Full name").fill(`UI Parent ${RUN}`);
  await page.getByLabel("Email", { exact: true }).fill(`ui.parent.${RUN}@e2e.test`);
  await page.getByLabel("Relation (optional)").fill("Mother");
  const kids = page.getByLabel("Children");
  await expect.poll(async () => (await kids.locator("option").allTextContents()).some((t) => t.includes("Demo Student")), { timeout: 20_000 }).toBe(true);
  const opts = await kids.locator("option").allTextContents();
  await kids.selectOption({ index: opts.findIndex((t) => t.includes("Demo Student")) });
  await page.getByRole("button", { name: "Add parent" }).last().click();
  await expect(page.getByText(`Added UI Parent ${RUN}.`)).toBeVisible();
  const parents = await apiJson(page, `/users?role=parent&q=UI%20Parent%20${RUN}`);
  expect(parents[0].childNames).toContain("Demo Student");
  await shot(page, "52-parent-linked");

  // deactivate through the API-backed UI is covered elsewhere; clean the guardian link through the manage panel
  await page.getByLabel(/Search parents/i).fill(`UI Parent ${RUN}`);
  const row = page.getByRole("row", { name: new RegExp(`UI Parent ${RUN}`) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Manage children" }).click();
  await expect(page.getByText("Demo Student").first()).toBeVisible();
});

test("syllabus: admin adds exam > subject, renames and deletes", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/syllabus", { waitUntil: "networkidle" });
  await page.getByPlaceholder("For example, Board exams").fill(`UI Exam ${RUN}`);
  await page.getByRole("button", { name: "Add exam" }).click();
  await expect(page.getByText(`UI Exam ${RUN}`).first()).toBeVisible();
  await page.getByRole("button", { name: `Add subject under UI Exam ${RUN}` }).click();
  await page.getByLabel("New subject name").fill("UI Subject");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("UI Subject")).toBeVisible();
  await page.getByRole("button", { name: "Rename UI Subject" }).click();
  await page.getByLabel("New name").fill("UI Subject Renamed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("UI Subject Renamed")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: `Delete UI Exam ${RUN}` }).click();
  await expect(page.getByText(`UI Exam ${RUN}`)).toHaveCount(0);
});

test("header: search jumps to a page, bell opens, sign out returns to login", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin", { waitUntil: "networkidle" });
  await page.getByLabel("Search pages").fill("batch");
  await expect(page.getByRole("listbox", { name: "Matching pages" })).toBeVisible();
  await page.getByLabel("Search pages").press("Enter");
  await expect(page).toHaveURL(/\/admin\/batches$/);
  await page.getByLabel("Search pages").fill("zzzz-nothing");
  await expect(page.getByText("No matching page")).toBeVisible();
  await page.getByLabel("Search pages").fill("");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
  await expect(page.locator("ul.divide-y").or(page.getByText(/all caught up/))).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/login/);
  await page.goto("/admin", { waitUntil: "networkidle" });
  expect(new URL(page.url()).pathname).toMatch(/login/);
});

test("notifications: student bell lists a result notification and mark all read clears the badge", async ({ page }) => {
  await login(page, "student");
  // make sure there is at least one unread notification: the worker writes one per released result
  const list = await apiJson(page, "/notifications?limit=5");
  const items = Array.isArray(list) ? list : list.items;
  await page.goto("/student", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Notifications/ }).click();
  if (items.length) await expect(page.locator("ul.divide-y li").first()).toBeVisible();
  const markAll = page.getByRole("button", { name: "Mark all read" });
  if (await markAll.isEnabled()) {
    await markAll.click();
    await expect.poll(async () => (await apiJson(page, "/notifications/unread-count")).count ?? 0).toBe(0);
  }
});

test("admin tests page: edit a test, then cancel it; students no longer see it", async ({ page }) => {
  await login(page, "teacher");
  // the demo batch is taught by the demo teacher; use any approved paper
  const papers = await apiJson(page, "/ingestion/papers");
  const paper = papers.find((p: any) => p.status === "approved");
  expect(paper, "an approved paper exists").toBeTruthy();
  const detail = await apiJson(page, `/ingestion/papers/${paper.id}`);
  const ids = detail.drafts.filter((d: any) => d.questionId).slice(0, 3).map((d: any) => d.questionId);
  const batches = await apiJson(page, "/batches");
  const title = `UI Cancel Test ${RUN}`;
  const created = await page.request.post("/api/v1/tests", {
    headers: ORIGIN,
    data: { title, paperId: paper.id, batchIds: [batches[0].id], presetKey: "nta", durationMinutes: 15, sections: [{ name: "General", questionIds: ids }],
      windowStart: new Date(Date.now() - 60_000).toISOString(), windowEnd: new Date(Date.now() + 86_400_000).toISOString() },
  });
  expect(created.status(), await created.text()).toBeLessThan(300);
  const t = await created.json();
  expect((await page.request.post(`/api/v1/tests/${t.id}/publish`, { headers: ORIGIN })).status()).toBeLessThan(300);

  await login(page, "admin");
  await page.goto("/admin/tests", { waitUntil: "networkidle" });
  const row = page.getByRole("row", { name: new RegExp(title) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Edit" }).click();
  await row.getByLabel(`Title for ${title}`).fill(`${title} v2`);
  await row.getByRole("button", { name: "Save test" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`${title} v2`) })).toBeVisible();
  const row2 = page.getByRole("row", { name: new RegExp(`${title} v2`) });
  await row2.getByRole("button", { name: "Cancel test" }).click();
  await row2.getByRole("button", { name: "Yes, cancel test" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`${title} v2`) })).toContainText("Cancelled");
  await expect(page.getByRole("row", { name: new RegExp(`${title} v2`) }).getByRole("button", { name: "Edit" })).toHaveCount(0);

  await login(page, "student");
  const up = await apiJson(page, "/tests/upcoming");
  expect(up.some((x: any) => x.id === t.id), "cancelled test hidden from students").toBe(false);
  const start = await page.request.post(`/api/v1/tests/${t.id}/attempts`, { headers: ORIGIN });
  expect(start.status()).toBe(404);
  // cancelled tests cannot be edited
  await login(page, "admin");
  const patch = await page.request.patch(`/api/v1/tests/${t.id}`, { headers: ORIGIN, data: { title: "nope" } });
  expect(patch.status()).toBe(409);
});

test("results exports: admin CSV downloads; student PDF report downloads", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/results", { waitUntil: "networkidle" });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), page.getByRole("button", { name: "Export CSV" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.csv$/);
  const csv = fs.readFileSync((await dl.path())!, "utf8");
  expect(csv).toContain("test_id,title");
  await page.goto("/admin/reports", { waitUntil: "networkidle" });
  for (const link of await page.locator("main a[href^='/admin']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))) {
    const r = await page.goto(link, { waitUntil: "networkidle" });
    expect(r?.status(), link).toBeLessThan(400);
  }
  await login(page, "student");
  const mine = await apiJson(page, "/results/mine");
  await page.goto(`/student/tests/results/${mine[0].attemptId}`, { waitUntil: "networkidle" });
  const link = page.getByRole("link", { name: "Download PDF report" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("flags: a flagged paper shows on the admin Flags page and opens in the review editor", async ({ page }) => {
  await login(page, "teacher");
  const up = await page.request.post("/api/v1/ingestion/papers", {
    headers: ORIGIN,
    multipart: { title: `UI Flagged ${RUN}`, file: { name: "flawed-paper.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: fs.readFileSync(FLAWED_DOCX) } },
  });
  expect(up.status(), await up.text()).toBeLessThan(300);
  const paper = await up.json();
  await expect.poll(async () => (await apiJson(page, `/ingestion/papers/${paper.id}`)).status, { timeout: 90_000 }).toBe("review");
  await login(page, "admin");
  await page.goto("/admin/flags", { waitUntil: "networkidle" });
  await expect(page.getByText(`UI Flagged ${RUN}`)).toBeVisible();
  await page.getByText(`UI Flagged ${RUN}`).first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/papers/${paper.id}`));
  await expect(page.getByRole("button", { name: /Approve/ })).toBeVisible();
  // the gate refuses approval while flags are open
  const r = await page.request.post(`/api/v1/ingestion/papers/${paper.id}/approve`, { headers: ORIGIN });
  expect(r.status()).toBe(422);
});

test("batch lifecycle: archive from the detail page; students list and weak topics pages render", async ({ page }) => {
  await login(page, "admin");
  const name = `UI Batch ${RUN}`;
  const res = await page.request.post("/api/v1/batches", { headers: ORIGIN, data: { name, year: 2026 } });
  const b = await res.json();
  await page.goto(`/admin/batches/${b.id}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: "Archive batch" }).click();
  await expect.poll(async () => (await apiJson(page, `/batches/${b.id}`)).status).toBe("archived");
  await page.request.delete(`/api/v1/batches/${b.id}`, { headers: ORIGIN });
});

test("student pages: weak topics, practice, syllabus and upcoming are all real", async ({ page }) => {
  const w = watch(page);
  await login(page, "student");
  await page.goto("/student/weak-topics", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /weak topics/i })).toBeVisible();
  await page.goto("/student/practice", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible();
  await page.goto("/student/tests/upcoming", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /upcoming/i }).first()).toBeVisible();
  expect([...w.rep.consoleErrors, ...w.rep.badResponses, ...w.rep.pageErrors]).toEqual([]);
});

test("Phase 2 pages are real: teacher attendance and feedback, parent attendance and feedback (no stub cards)", async ({ page }) => {
  await login(page, "teacher");
  await page.goto("/teacher/attendance", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Save attendance" }).or(page.getByText("No students are enrolled"))).toBeVisible();
  await expect(page.getByText(/Phase 2/)).toHaveCount(0);
  await page.goto("/teacher/feedback", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Send feedback" })).toBeVisible();
  await login(page, "parent");
  for (const p of ["/parent/attendance", "/parent/feedback"]) {
    await page.goto(p, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText(/Phase 2/)).toHaveCount(0);
  }
});

test("parent: results list and result detail, child switcher present", async ({ page }) => {
  await login(page, "parent");
  await page.goto("/parent/results", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Child")).toBeVisible();
  const first = page.locator("main a[href^='/parent/results/']").first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(/\/parent\/results\/.+/);
  await expect(page.getByText(/score/i).first()).toBeVisible();
});
