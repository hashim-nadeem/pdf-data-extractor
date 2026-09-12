import { expect, test, type Page } from "@playwright/test";

const SHOTS = "e2e/screenshots";

/** Runs a sample document all the way through and waits for the fields to land. */
async function extractSample(page: Page, label: string) {
  await page.goto("/");
  await page.getByRole("button", { name: label }).click();
  await expect(page.getByRole("list", { name: "Extraction progress" })).toBeVisible();
  // The free tier occasionally takes 30s+ under load, and lib/llm.ts backs off twice.
  await expect(page.getByRole("region", { name: /Document preview/ })).toBeVisible({
    timeout: 150_000,
  });
}

test("the invoice sample extracts, and hovering a field highlights its source", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Processed in memory. Nothing is stored.")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-upload.png`, fullPage: true });

  await page.getByRole("button", { name: "Sample invoice" }).click();
  await expect(page.getByRole("list", { name: "Extraction progress" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-stepper.png` });

  // The extracted value, in mono, on the right.
  const row = page.getByRole("button").filter({ hasText: "INV-2024-0800" });
  await expect(row).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText("grounded", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500); // let the PDF text layer finish rendering
  await page.screenshot({ path: `${SHOTS}/03-extracted.png`, fullPage: true });

  // The interaction the whole project exists for.
  await row.hover();
  const highlight = page.locator(".src-highlight");
  await expect(highlight.first()).toBeVisible();

  // It must sit over the rendered page, not collapsed at the origin.
  const box = await highlight.first().boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(10);
  expect(box!.height).toBeGreaterThan(4);
  await page.screenshot({ path: `${SHOTS}/04-hover-highlight.png` });

  // Click pins it and shows the verbatim source.
  await row.click();
  // Scoped to the panel: the same string also exists in the PDF's own text layer.
  const panel = page.getByText(/source · page 1 · confidence/).locator("xpath=..");
  await expect(panel).toBeVisible();
  // The exact span the model cites varies run to run; it must contain the value.
  await expect(panel).toContainText("INV-2024-0800");
  await page.screenshot({ path: `${SHOTS}/05-pinned.png` });

  // Escape clears the pin.
  await page.keyboard.press("Escape");
  await expect(page.getByText(/source · page 1 · confidence/)).toBeHidden();
});

test("absent fields render as an em dash rather than disappearing", async ({ page }) => {
  await extractSample(page, "Sample invoice");
  const dueDate = page.getByRole("button", { name: /due date/i });
  await expect(dueDate).toContainText("—");
  await expect(page.getByRole("button", { name: /tax id/i })).toContainText("—");
  await page.screenshot({ path: `${SHOTS}/06-null-fields.png` });
});

test("a line item cell highlights its own source", async ({ page }) => {
  await extractSample(page, "Sample invoice");
  await page.waitForTimeout(1500);
  const cell = page.getByRole("cell").filter({ hasText: "Freight surcharge" }).first();
  await expect(cell).toBeVisible();
  await cell.getByRole("button").hover();
  await expect(page.locator(".src-highlight").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-line-items.png` });
});

test("JSON and CSV export produce real files", async ({ page }) => {
  await extractSample(page, "Sample invoice");

  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const jsonFile = await json;
  expect(jsonFile.suggestedFilename()).toBe("invoice-extraction.json");

  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const csvFile = await csv;
  expect(csvFile.suggestedFilename()).toBe("invoice-extraction.csv");

  const body = await (await csvFile.createReadStream()).toArray();
  const text = Buffer.concat(body).toString();
  expect(text).toContain("field,value,confidence,page,grounded,sourceText");
  expect(text).toContain("invoiceNumber,INV-2024-0800");
});

test("the CV and contract schemas both extract", async ({ page }) => {
  await extractSample(page, "Sample CV");
  await expect(page.getByRole("button").filter({ hasText: "Ada Marlow" })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/08-cv.png`, fullPage: true });

  await extractSample(page, "Sample contract");
  await expect(page.getByRole("button").filter({ hasText: /agreement/i }).first()).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/09-contract.png`, fullPage: true });
});

test("the theme toggle overrides the system preference", async ({ page }) => {
  await extractSample(page, "Sample invoice");
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Toggle light and dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /dark|light/);
  await page.screenshot({ path: `${SHOTS}/10-theme-toggled.png`, fullPage: true });
});

test("375px has no horizontal scroll and the preview collapses", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await extractSample(page, "Sample invoice");
  await page.waitForTimeout(1200);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await expect(page.getByRole("button", { name: "Document preview" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/11-mobile.png`, fullPage: true });
});

test("a non-PDF is rejected with its own message", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not a pdf"),
  });
  await expect(page.getByText("That file isn't a PDF. Only PDF files are supported.")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/12-error-not-pdf.png` });
});
