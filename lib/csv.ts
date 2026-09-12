import { isField, type Field } from "./schemas/field";

const cell = (v: unknown) => {
  const raw = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  // Values come from a model reading an untrusted document, and this file exists
  // to be opened in a spreadsheet: neutralise anything Excel would execute.
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** field,value,confidence,page,grounded,sourceText — one row per leaf field. */
export function toCsv(data: unknown): string {
  const rows: unknown[][] = [["field", "value", "confidence", "page", "grounded", "sourceText"]];

  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    if (!node || typeof node !== "object") return;
    if (isField(node)) {
      const f = node as Field<unknown>;
      rows.push([
        path,
        f.value,
        f.value === null ? "" : f.confidence.toFixed(2),
        f.page,
        f.value === null ? "" : f.ungrounded ? "no" : "yes",
        f.sourceText,
      ]);
      return;
    }
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
  };

  walk(data, "");
  // CRLF per RFC 4180; ExportBar prepends the BOM Excel needs for UTF-8.
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
