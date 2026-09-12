import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { extractDocument } from "../lib/extract";
import { extractPdfText } from "../lib/pdf";
import type { ExtractError } from "../lib/errors";
import type { Field } from "../lib/schemas/field";

process.env.LLM_PROVIDER = "ollama";

/** Answers as the provider would, so the whole pipeline runs offline. */
function stubProvider(...responses: unknown[]) {
  const queue = [...responses];
  const real = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ response: JSON.stringify(queue.shift()) }), {
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  return () => {
    globalThis.fetch = real;
  };
}

const field = (value: unknown, sourceText: string) => ({ value, confidence: 0.9, sourceText, page: 1 });
const nul = () => ({ value: null, confidence: 0, sourceText: "", page: null });

const invoiceReply = (overrides: Record<string, unknown> = {}) => ({
  invoiceNumber: field("INV-2024-0800", "Invoice No. INV-2024-0800"),
  issueDate: field("2024-10-24", "Issue date 2024-10-24"),
  dueDate: nul(),
  currency: field("GBP", "Currency GBP"),
  vendor: {
    name: field("Northwind Ltd", "Northwind Ltd"),
    address: field("14 Fennel Way, Bristol BS1 4TR", "14 Fennel Way\nBristol BS1 4TR"),
    taxId: nul(),
    email: field("accounts@northwindltd.example", "accounts@northwindltd.example"),
  },
  customer: { name: field("Ironwood Supplies", "Ironwood Supplies"), address: nul() },
  lineItems: [],
  subtotal: field(4307.96, "Subtotal £4,307.96"),
  taxRate: field(20, "VAT 20%"),
  taxAmount: field(861.59, "VAT 20% £861.59"),
  total: field(5169.55, "Total due £5,169.55"),
  paymentTerms: nul(),
  ...overrides,
});

const pdf = () => extractPdfText(new Uint8Array(fs.readFileSync("evals/fixtures/invoice-01.pdf")));

test("a well-grounded response comes back parsed and verified", async () => {
  const restore = stubProvider(invoiceReply());
  try {
    const out = await extractDocument("invoice", await pdf());
    const data = out.data as Record<string, Field<unknown>>;
    assert.equal(data.invoiceNumber!.value, "INV-2024-0800");
    assert.equal(data.invoiceNumber!.ungrounded, false);
    assert.equal(data.dueDate!.value, null);
    assert.equal(out.stats.ungrounded, 0);
    assert.ok(out.stats.grounded >= 8);
  } finally {
    restore();
  }
});

test("a hallucinated value is flagged ungrounded end to end", async () => {
  const restore = stubProvider(
    invoiceReply({ total: field(99999, "Total due £99,999.00 paid in advance") }),
  );
  try {
    const out = await extractDocument("invoice", await pdf());
    const data = out.data as Record<string, Field<unknown>>;
    assert.equal(data.total!.ungrounded, true);
    assert.equal(data.total!.confidence, 0);
    assert.equal(out.stats.ungrounded, 1);
  } finally {
    restore();
  }
});

test("an invalid response is retried once, then succeeds", async () => {
  const restore = stubProvider({ invoiceNumber: "not a field envelope" }, invoiceReply());
  try {
    const out = await extractDocument("invoice", await pdf());
    assert.equal((out.data as Record<string, Field<unknown>>).invoiceNumber!.value, "INV-2024-0800");
  } finally {
    restore();
  }
});

test("two invalid responses give a structured error, not a guess", async () => {
  const restore = stubProvider({ invoiceNumber: 1 }, { invoiceNumber: 2 });
  const text = await pdf();
  try {
    await assert.rejects(
      () => extractDocument("invoice", text),
      (e: ExtractError) => e.code === "invalid_output",
    );
  } finally {
    restore();
  }
});
