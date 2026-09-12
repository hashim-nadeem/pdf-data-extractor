import assert from "node:assert/strict";
import { test } from "node:test";
import { isDocType, jsonSchemaFor } from "../lib/schemas";

test("only own keys are document types", () => {
  assert.equal(isDocType("invoice"), true);
  assert.equal(isDocType("cv"), true);
  assert.equal(isDocType("contract"), true);
  // `in` would accept all of these and then crash on the lookup.
  for (const probe of ["toString", "constructor", "__proto__", "valueOf", "hasOwnProperty"]) {
    assert.equal(isDocType(probe), false, `${probe} must not be a document type`);
  }
  assert.equal(isDocType(""), false);
  assert.equal(isDocType(null), false);
});

test("the JSON Schema is derived for all three types and cached by identity", () => {
  for (const t of ["invoice", "cv", "contract"] as const) {
    const schema = jsonSchemaFor(t) as { properties: Record<string, unknown> };
    assert.ok(Object.keys(schema.properties).length > 8);
    assert.equal(jsonSchemaFor(t), schema, "repeated derivation should hit the cache");
  }
});
