import { test, expect, type Page } from "@playwright/test";
import { login, shot } from "./helpers";

const RUN = Date.now().toString().slice(-6);
const STEM = `Editor check ${RUN}: what is the derivative of`;

async function fillEditor(page: Page, label: string, text: string) {
  const ed = page.getByLabel(label, { exact: true });
  await ed.click();
  await page.keyboard.type(text);
}

async function noOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "horizontal overflow px").toBeLessThanOrEqual(1);
}

test("teacher creates an MCQ with maths, finds it, edits it", async ({ page }) => {
  await login(page, "teacher");
  await page.goto("/teacher/questions/new", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "New question" })).toBeVisible();

  // Left settings panel
  await page.getByLabel("Difficulty", { exact: true }).selectOption("hard");
  await page.getByLabel("Grade / Class").fill("11th grade");
  await page.getByLabel("Textbook / Source").fill("NCERT Physics");

  // Stem with a formula via the toolbar dialog
  await fillEditor(page, "Question text", STEM + " ");
  await page.getByRole("button", { name: "Insert formula" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Insert formula" });
  await expect(dialog).toBeVisible();
  await page.waitForFunction(() => !!customElements.get("math-field"));
  await dialog.locator("math-field").click();
  await page.keyboard.type("x^2");
  await dialog.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(page.locator(".katex").first()).toBeVisible();

  // Choices
  for (const [id, text] of [["A", "2x"], ["B", "x"], ["C", "2"], ["D", "0"]]) await fillEditor(page, `Choice ${id}`, text);
  await page.getByLabel("Option A is correct").check();

  // Details
  await page.getByLabel("Tags", { exact: true }).fill("calculus");
  await page.getByLabel("Tags", { exact: true }).press("Enter");
  await page.getByLabel("Author").fill("Demo Teacher");
  await page.getByLabel("Learning outcomes").fill("Differentiate polynomials");
  await fillEditor(page, "Explanation", "Power rule.");

  // Image attach (tiny PNG)
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Image file").first().setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: png });
  await expect(page.locator('.ProseMirror img[src^="data:image/png"]').first()).toBeVisible();

  await page.getByRole("heading", { name: "New question" }).scrollIntoViewIfNeeded();
  await shot(page, "question-editor-desktop");
  await noOverflow(page);

  // Validation: missing nothing; publish
  await page.getByRole("button", { name: "Publish question" }).first().click();
  await page.waitForURL(/\/teacher\/question-bank/);

  // Find it in the bank
  await page.getByLabel("Search questions").fill(`Editor check ${RUN}`);
  const row = page.getByRole("row", { name: new RegExp(`Editor check ${RUN}`, "i") });
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForURL(/\/teacher\/questions\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: /Edit question \(v1\)/ })).toBeVisible();
  // Round-trip: stored fields and image reload
  await expect(page.getByLabel("Grade / Class")).toHaveValue("11th grade");
  await expect(page.getByLabel("Author")).toHaveValue("Demo Teacher");
  await expect(page.getByLabel("Difficulty", { exact: true })).toHaveValue("hard");
  await expect(page.locator(".katex").first()).toBeVisible();
  await expect(page.locator('.ProseMirror img[src^="data:image/png"]').first()).toBeVisible();
  await shot(page, "question-editor-edit-desktop");

  // Edit and save again
  await page.getByLabel("Question text", { exact: true }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" (edited)");
  await page.getByLabel("Option B is correct").check();
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await page.waitForURL(/\/teacher\/question-bank/);
  await page.getByLabel("Search questions").fill(`Editor check ${RUN}`);
  await expect(page.getByRole("row", { name: /edited/i })).toBeVisible();
  await page.getByRole("row", { name: /edited/i }).click();
  await expect(page.getByRole("heading", { name: /Edit question \(v2\)/ })).toBeVisible();
  await expect(page.getByLabel("Option B is correct")).toBeChecked();
});

test("admin new-question page renders", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/questions/new", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Publish question" }).first()).toBeVisible();
  // empty submit shows validation, not a crash
  await page.getByRole("button", { name: "Publish question" }).first().click();
  await expect(page.getByRole("alert").filter({ hasText: "Question text is required" })).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const path of ["/teacher/questions/new", "/admin/questions/new"]) {
    test(`no h-overflow ${path}`, async ({ page }) => {
      await login(page, path.startsWith("/admin") ? "admin" : "teacher");
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.getByRole("button", { name: "Publish question" }).first()).toBeVisible();
      await noOverflow(page);
      await shot(page, `question-editor-mobile-${path.split("/")[1]}`);
      await page.getByLabel("Choice D", { exact: true }).scrollIntoViewIfNeeded();
      await noOverflow(page);
      await page.screenshot({ path: `../demo/screenshots/question-editor-mobile-${path.split("/")[1]}-full.png`, fullPage: true });
    });
  }
});
