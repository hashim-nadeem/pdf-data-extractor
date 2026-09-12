import { z } from "zod";
import { contractSchema } from "./contract";
import { cvSchema } from "./cv";
import { invoiceSchema } from "./invoice";

export const DOC_TYPES = {
  invoice: {
    label: "Invoice",
    schema: invoiceSchema,
    hint: "A commercial invoice or bill. Amounts are numbers without currency symbols.",
  },
  cv: {
    label: "CV / Résumé",
    schema: cvSchema,
    hint: "A curriculum vitae. `current` is true only when the role has no end date.",
  },
  contract: {
    label: "Contract",
    schema: contractSchema,
    hint:
      "A legal agreement. `parties` role is e.g. 'Supplier', 'Client', 'Licensor'. " +
      "`governingLaw` and `jurisdiction` are the full phrases as the document writes them " +
      "(e.g. 'the laws of England and Wales' and 'the courts of England and Wales'), not just the place.",
  },
} as const;

export type DocType = keyof typeof DOC_TYPES;

// `in` walks the prototype chain, so it would accept "toString" and friends and
// then crash on the lookup. Own keys only.
export const isDocType = (v: unknown): v is DocType =>
  typeof v === "string" && Object.hasOwn(DOC_TYPES, v);

const schemaCache = new Map<DocType, object>();

/** Zod is the contract; the JSON Schema handed to the model is derived from it. */
export function jsonSchemaFor(t: DocType): object {
  let cached = schemaCache.get(t);
  if (!cached) {
    cached = z.toJSONSchema(DOC_TYPES[t].schema, { io: "input", target: "draft-7" });
    schemaCache.set(t, cached);
  }
  return cached;
}
