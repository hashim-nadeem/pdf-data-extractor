import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import PDFDocument from "pdfkit";
import { extractPdfText, guardFile } from "../lib/pdf";
import { ExtractError } from "../lib/errors";

const bytes = (p: string) => new Uint8Array(fs.readFileSync(p));

test("a fixture PDF yields page-tagged text", async () => {
  const out = await extractPdfText(bytes("evals/fixtures/invoice-01.pdf"));
  assert.equal(out.totalPages, 1);
  assert.match(out.tagged, /^\[page 1\]/);
  assert.match(out.tagged, /INV-2024-0800/);
  assert.match(out.tagged, /SAMPLE/);
  assert.equal(out.sampledPages, null);
});

test("an image-only PDF returns the no-text-layer error", async () => {
  const doc = new PDFDocument({ size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on("end", () => r()));
  doc.rect(100, 100, 300, 300).fill("#333");
  doc.end();
  await done;
  await assert.rejects(
    () => extractPdfText(new Uint8Array(Buffer.concat(chunks))),
    (e: ExtractError) => e.code === "no_text_layer",
  );
});

test("guards reject non-PDFs and oversized files", () => {
  assert.throws(() => guardFile(new File(["x"], "a.txt", { type: "text/plain" })), /isn't a PDF/);
  const big = new File([new Uint8Array(11 * 1024 * 1024)], "a.pdf", { type: "application/pdf" });
  assert.throws(() => guardFile(big), /larger than the limit/);
  assert.throws(() => guardFile(null), /No file was uploaded/);
});

test("a malformed limit env var falls back instead of removing the limit", async () => {
  // NaN > x is false, which would silently disable the guard.
  const before = process.env.MAX_FILE_MB;
  process.env.MAX_FILE_MB = "not-a-number";
  const { MAX_MB } = await import(`../lib/pdf?cachebust=${Date.now()}`);
  assert.equal(MAX_MB, 10);
  process.env.MAX_FILE_MB = before;
});
