import assert from "node:assert/strict";
import { test } from "node:test";
import { groundCheck, normalise } from "../lib/grounding";
import { toCsv } from "../lib/csv";
import { invoiceSchema } from "../lib/schemas/invoice";
import type { Field } from "../lib/schemas/field";

const DOC = `[page 1]
Northwind Ltd
Invoice   INV-2024-0891
Issue date: 14 March 2024
Total due  4280.00`;

const field = (value: unknown, sourceText: string, page: number | null = 1): Field<unknown> => ({
  value,
  confidence: 0.9,
  sourceText,
  page,
});

test("a grounded field keeps its confidence", () => {
  const data = { a: field("INV-2024-0891", "Invoice   INV-2024-0891") };
  const stats = groundCheck(data, DOC);
  assert.equal(data.a.ungrounded, false);
  assert.equal(data.a.confidence, 0.9);
  assert.deepEqual(stats, { total: 1, present: 1, grounded: 1, ungrounded: 0 });
});

test("whitespace and case differences still ground", () => {
  const data = { a: field("Northwind Ltd", "northwind    ltd") };
  groundCheck(data, DOC);
  assert.equal(data.a.ungrounded, false);
});

test("a fabricated sourceText is caught and forced to confidence 0", () => {
  const data = { a: field("£9,999.00", "Total due 9999.00 payable to Acme") };
  const stats = groundCheck(data, DOC);
  assert.equal(data.a.ungrounded, true);
  assert.equal(data.a.confidence, 0);
  assert.equal(stats.ungrounded, 1);
});

test("an empty sourceText is ungrounded", () => {
  const data = { a: field("something", "") };
  groundCheck(data, DOC);
  assert.equal(data.a.ungrounded, true);
});

test("null fields are confidence 0 and not counted as present", () => {
  const data = { a: field(null, "") };
  const stats = groundCheck(data, DOC);
  assert.equal(data.a.confidence, 0);
  assert.equal(data.a.ungrounded, false);
  assert.equal(stats.present, 0);
});

test("nested objects and arrays are walked", () => {
  const data = {
    vendor: { name: field("Northwind Ltd", "Northwind Ltd") },
    lineItems: [{ total: field(4280, "Total due  4280.00") }, { total: field(1, "not in the doc") }],
  };
  const stats = groundCheck(data, DOC);
  assert.equal(stats.total, 3);
  assert.equal(stats.grounded, 2);
  assert.equal(stats.ungrounded, 1);
});

test("confidence is clamped into 0..1", () => {
  const data = { a: { value: "Northwind Ltd", confidence: 95, sourceText: "Northwind Ltd", page: 1 } };
  groundCheck(data, DOC);
  assert.equal(data.a.confidence, 1);
});

test("normalise collapses whitespace and case", () => {
  assert.equal(normalise("  A  \n B "), "a b");
});

test("a missing field parses to a null field rather than failing", () => {
  const parsed = invoiceSchema.parse({
    vendor: {}, customer: {},
  });
  assert.equal(parsed.invoiceNumber.value, null);
  assert.equal(parsed.vendor.name.confidence, 0);
  assert.deepEqual(parsed.lineItems, []);
});

test("csv escapes commas and quotes, and flags grounding", () => {
  const data = { total: field(4280, 'Total due, "4280.00"') };
  groundCheck(data, DOC);
  const csv = toCsv(data);
  assert.match(csv, /^field,value,confidence,page,grounded,sourceText/);
  assert.match(csv, /total,4280,0\.00,1,no,"Total due, ""4280\.00"""/);
});

// --- review fixes ---------------------------------------------------------

test("a real span that doesn't contain the value is rejected", () => {
  // The span exists in the document, but says nothing about £9,999.
  const data = { total: field(9999, "Northwind Ltd") };
  const stats = groundCheck(data, DOC);
  assert.equal(data.total.ungrounded, true);
  assert.equal(data.total.confidence, 0);
  assert.equal(stats.grounded, 0);
});

test("a number cited with currency and separators still grounds", () => {
  const data = { total: field(4280, "Total due  4280.00") };
  groundCheck(data, DOC);
  assert.equal(data.total.ungrounded, false);
});

test("a string value inside its span grounds", () => {
  const data = { vendor: field("Northwind Ltd", "Northwind Ltd") };
  groundCheck(data, DOC);
  assert.equal(data.vendor.ungrounded, false);
});

test("a reformatted date is not punished", () => {
  const data = { issued: field("2024-03-14", "Issue date: 14 March 2024") };
  groundCheck(data, DOC);
  assert.equal(data.issued.ungrounded, false);
});

test("csv neutralises spreadsheet formulas", () => {
  const data = { note: field("=cmd|'/c calc'!A1", "Invoice   INV-2024-0891") };
  groundCheck(data, DOC);
  const csv = toCsv(data);
  assert.match(csv, /,'=cmd/, "a leading = must be quoted out");
  assert.ok(csv.includes("\r\n"), "rows are CRLF per RFC 4180");
});
