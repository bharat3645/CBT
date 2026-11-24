import { test, expect, type Page } from "@playwright/test";
import { login, shot } from "./helpers";

/**
 * Sidebar pages that used to be stubs (batches, people, CSV import, syllabus, settings, reports, results) plus the
 * real-data dashboards. Runs against the live stack with the demo logins; every created record is unique per run.
 */
const RUN = Date.now().toString(36);
const BATCH = `E2E Batch ${RUN}`;

const PLACEHOLDERS = ["Rohan", "Aarav", "Anita", "BrightPath", "Physics Mock 12", "Chemistry Mock 9", "Meera Singh"];

async function apiJson<T = any>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(`/api/v1${path}`);
  expect(res.status(), `${path} -> ${res.status()}`).toBe(200);
  return (await res.json()) as T;
}

test.describe.configure({ mode: "serial" });

test("admin creates a batch and opens its roster", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/batches");
  await expect(page.getByRole("heading", { name: "Batches" })).toBeVisible();
  await page.getByRole("button", { name: "New batch" }).click();
  await page.getByLabel("Name", { exact: true }).fill(BATCH);
  await page.getByRole("button", { name: "Create batch" }).click();
  await expect(page.getByText(`Created batch ${BATCH}.`)).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(BATCH) });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: BATCH }).click();
  await expect(page.getByRole("heading", { name: BATCH })).toBeVisible();
  await expect(page.getByText("No students in this batch yet.")).toBeVisible();
  await shot(page, "20-admin-batch-detail");
});

test("admin adds one student with the form and enrols them in the batch", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/students");
  await page.getByRole("button", { name: "Add student" }).first().click();
  await page.getByLabel("Full name").fill(`Form Student ${RUN}`);
  await page.getByLabel("Email", { exact: true }).fill(`form.${RUN}@e2e.test`);
  await page.getByLabel("Roll number (optional)").fill(`F-${RUN}`);
  await page.getByRole("checkbox", { name: BATCH }).check();
  await page.getByRole("button", { name: "Add student" }).last().click();
  await expect(page.getByText(`Added Form Student ${RUN}.`)).toBeVisible();
  await page.getByLabel("Search students").fill(`Form Student ${RUN}`);
  const row = page.getByRole("row", { name: new RegExp(`Form Student ${RUN}`) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(BATCH);

  // the batch roster shows the new student, and the student count column follows
  await page.goto("/admin/batches");
  const batchRow = page.getByRole("row", { name: new RegExp(BATCH) });
  await expect(batchRow.getByRole("cell").nth(2)).toHaveText("1");
});

test("CSV import: 3 students, one bad row gets a per-row error and an errors.csv", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/students");
  await page.getByRole("button", { name: "Import CSV" }).click();
  const csv = [
    "role,name,email,roll_no,batches",
    `student,Csv One ${RUN},csv1.${RUN}@e2e.test,C1-${RUN},${BATCH}`,
    `student,Csv Bad ${RUN},not-an-email,C2-${RUN},${BATCH}`,
    `student,Csv Three ${RUN},csv3.${RUN}@e2e.test,C3-${RUN},${BATCH}`,
  ].join("\n");
  await page.getByLabel("CSV file").setInputFiles({ name: "students.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByLabel("CSV contents")).toHaveValue(csv);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  const result = page.getByTestId("import-result");
  await expect(result).toContainText("Imported 2 of 3 rows");
  // header is line 1, so the bad row is row 3
  const bad = result.getByRole("row", { name: /Row 3/ });
  await expect(bad).toContainText("email");
  await expect(bad).toContainText(/invalid email/i);
  await expect(result.getByRole("row", { name: /Row 2/ })).toHaveCount(0);
  await shot(page, "20-admin-csv-import");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download errors.csv" }).click()]);
  expect(download.suggestedFilename()).toBe("import-errors.csv");
  const body = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
  expect(body).toContain(`Csv Bad ${RUN}`);
  expect(body).toMatch(/invalid email/i);
  expect(body).not.toContain(`Csv One ${RUN}`);

  // the two good rows exist and were enrolled in the batch
  const search = page.getByLabel("Search students");
  await search.fill(`Csv One ${RUN}`);
  await expect(page.getByRole("row", { name: new RegExp(`Csv One ${RUN}`) })).toContainText(BATCH);
  await search.fill(`Csv Three ${RUN}`);
  await expect(page.getByRole("row", { name: new RegExp(`Csv Three ${RUN}`) })).toContainText(BATCH);
  await search.fill(`Csv Bad ${RUN}`);
  await expect(page.getByText("No one matches this filter.")).toBeVisible();

  // batch roster now holds 3 students (form + 2 csv)
  const batches = await apiJson<{ name: string; studentCount: number }[]>(page, "/batches");
  expect(batches.find((b) => b.name === BATCH)?.studentCount).toBe(3);
});

test("admin parents: guardian link panel shows the real linked child", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/parents");
  const row = page.getByRole("row", { name: /Demo Parent/ });
  await expect(row).toContainText("Demo Student");
  await row.getByRole("button", { name: "Manage children" }).click();
  await expect(page.getByLabel("Children of Demo Parent")).toContainText("Demo Student");
  await page.goto("/admin/teachers");
  await expect(page.getByRole("row", { name: /Demo Teacher/ })).toContainText("JEE-2026-A");
});

test("admin removes a student from the batch roster", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/batches");
  await page.getByRole("link", { name: BATCH }).first().click();
  await expect(page.getByRole("heading", { name: /Students \(3\)/ })).toBeVisible();
  await page.getByRole("button", { name: `Remove Csv Three ${RUN} from batch` }).click();
  await expect(page.getByRole("heading", { name: /Students \(2\)/ })).toBeVisible();
});

test("admin settings: save branding, it persists, then restore", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/settings");
  const color = page.getByLabel("Brand colour", { exact: true });
  await expect(color).toBeVisible();
  const before = await color.inputValue();
  await color.fill("#0f766e");
  await page.getByLabel("Contact email").fill(`contact.${RUN}@e2e.test`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Brand colour", { exact: true })).toHaveValue("#0f766e");
  await expect(page.getByLabel("Contact email")).toHaveValue(`contact.${RUN}@e2e.test`);
  const inst = await apiJson<{ brandColor: string; contactEmail: string }>(page, "/institute");
  expect(inst.brandColor).toBe("#0f766e");
  await shot(page, "20-admin-settings");

  await page.getByLabel("Brand colour", { exact: true }).fill(before);
  await page.getByLabel("Contact email").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("syllabus: admin copies a template, teacher marks a topic, student sees progress", async ({ page }) => {
  await login(page, "admin");
  const tree = await apiJson<unknown[]>(page, "/syllabus/tree");
  await page.goto("/admin/syllabus");
  if (tree.length === 0) {
    await page.getByRole("button", { name: "Copy JEE Main (sample)" }).click();
    await expect(page.getByText(/Copied JEE Main \(sample\)/)).toBeVisible();
  }
  await expect(page.getByRole("tree")).toContainText("Physics");
  await shot(page, "20-admin-syllabus");

  // teacher: open the demo batch, mark the first visible topic completed
  await login(page, "teacher");
  await page.goto("/teacher/batches");
  await page.getByRole("link", { name: "JEE-2026-A" }).first().click();
  await expect(page.getByRole("heading", { name: "JEE-2026-A" })).toBeVisible();
  await page.getByRole("button", { name: "Expand all" }).click();
  const select = page.getByRole("combobox", { name: /^Progress for / }).first();
  await select.selectOption("completed");
  await expect(select).toHaveValue("completed");
  await expect(page.getByText(/[1-9]\d*% of topics completed|0% of topics completed/).first()).toBeVisible();

  // student of that batch sees the tree read-only with a non-zero overall percentage
  await login(page, "student");
  await page.goto("/student/syllabus");
  await expect(page.getByRole("tree")).toContainText("Physics");
  await expect(page.getByRole("combobox", { name: /^Progress for / })).toHaveCount(0);
  await expect(page.getByText(/^[1-9]\d*% of topics completed$/)).toBeVisible();
  await shot(page, "20-student-syllabus");

  // parent sees the same for the child's batch
  await login(page, "parent");
  await page.goto("/parent/syllabus");
  await expect(page.getByRole("tree")).toContainText("Physics");
  await expect(page.getByText(/^[1-9]\d*% of topics completed$/)).toBeVisible();
});

test("results, reports, practice, attendance and feedback pages are real or honest", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/results");
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(page.getByText(/Could not|Something went wrong/)).toHaveCount(0);
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Results and analytics/ })).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("row", { name: /All batches/ }).getByRole("button").click()]);
  expect(dl.suggestedFilename()).toBe("batch-analytics.csv");
  const csv = await (await import("node:fs/promises")).readFile((await dl.path())!, "utf8");
  expect(csv.split("\n")[0]).toBe("test_id,title,participants,avg_pct,median_pct");

  await login(page, "student");
  await page.goto("/student/practice");
  await expect(page.getByText("Phase 2").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where to focus" })).toBeVisible();

  await login(page, "teacher");
  await page.goto("/teacher/attendance");
  await expect(page.getByText("Phase 2").first()).toBeVisible();

  await login(page, "parent");
  await page.goto("/parent/attendance");
  await expect(page.getByText("Phase 2").first()).toBeVisible();
  await page.goto("/parent/feedback");
  await expect(page.getByText("Phase 2").first()).toBeVisible();
  await page.goto("/parent/results");
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(page.getByText("Demo Student's released test results.")).toBeVisible();
  await expect(page.getByText(/Could not|Forbidden/)).toHaveCount(0);
});

test("parent child switcher comes from the real guardian links", async ({ page }) => {
  await login(page, "parent");
  await page.goto("/parent");
  const select = page.getByLabel("Child");
  await expect(select).toBeVisible();
  await expect(select.locator("option")).toHaveText(["Demo Student"]);
  const kids = await apiJson<{ name: string }[]>(page, "/children");
  expect(kids.map((k) => k.name)).toEqual(["Demo Student"]);
});

test.describe("dashboards use real data, not placeholders", () => {
  for (const role of ["admin", "teacher", "student", "parent"] as const) {
    test(`${role} dashboard`, async ({ page }) => {
      await login(page, role);
      await page.goto(`/${role}`);
      await page.waitForLoadState("networkidle");
      const dash = await apiJson<any>(page, "/dashboard");
      expect(dash.role).toBe(role === "admin" ? "institute_admin" : role);

      const main = page.locator("main");
      const heading = main.getByRole("heading", { level: 1 });
      await expect(heading).toContainText("Demo");
      for (const p of PLACEHOLDERS) await expect(page.locator("body")).not.toContainText(p);
      // the signed-in user's real name and institute are in the sidebar
      await expect(page.locator("body")).toContainText(`Demo ${role === "admin" ? "Admin" : role[0]!.toUpperCase() + role.slice(1)}`);
      await expect(page.locator("body")).toContainText("Demo Academy");

      if (role === "admin") {
        const s = dash.stats;
        expect(s.activeStudents).toBeGreaterThanOrEqual(3); // demo student + the rows created above
        await expect(main.getByText("Active students").locator("xpath=..")).toContainText(String(s.activeStudents));
        await expect(main.getByText("Tests this week").locator("xpath=..")).toContainText(String(s.testsThisWeek));
        await expect(main.getByText("Papers awaiting approval").locator("xpath=..")).toContainText(String(s.papersAwaitingApproval));
        // sidebar badge equals the API count (no badge when zero)
        const papersLink = page.getByRole("link", { name: /^Papers/ });
        if (dash.badges.papersToReview > 0) await expect(papersLink).toContainText(String(dash.badges.papersToReview));
        else await expect(papersLink).not.toContainText(/\d/);
      }
      if (role === "teacher") {
        await expect(main.getByText("My batches").locator("xpath=..")).toContainText(String(dash.stats.batches));
        expect(dash.stats.batches).toBeGreaterThanOrEqual(1);
      }
      if (role === "student") {
        await expect(main.getByText("Tests attempted").locator("xpath=..")).toContainText(String(dash.stats.testsAttempted));
      }
      if (role === "parent") {
        await expect(heading).toContainText("Demo's progress");
        await expect(page.getByLabel("Child")).toHaveValue(dash.child.studentId);
      }
      await shot(page, `20-${role}-dashboard`);
    });
  }
});
