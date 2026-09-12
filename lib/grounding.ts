import { isField, type Field } from "./schemas/field";

/** Whitespace-collapsed, case-insensitive comparison. */
export const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export type GroundStats = {
  total: number;
  present: number;
  grounded: number;
  ungrounded: number;
};

/** Numbers are written many ways; compare them as numbers, not as strings. */
const numeric = (s: string) => {
  const digits = s.replace(/[^\d.-]/g, "");
  if (!/\d/.test(digits)) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
};

/** Punctuation differs freely between a value and the span it was read from. */
const loose = (s: string) =>
  normalise(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Does the cited span actually contain the value it was cited for? A span that
 * exists in the document but says something else is not evidence, and the
 * document-presence check alone would accept it.
 *
 * Deliberately lenient in three places, because the alternative is punishing
 * correct extractions: booleans and other non-scalars are inferred rather than
 * quoted, dates are legitimately reformatted, and long free text is paraphrased.
 */
function spanSupportsValue(value: unknown, span: string): boolean {
  if (typeof value === "number") {
    // "£4,307.96" for 4307.96, or a longer phrase with the figure inside it.
    return numeric(span) === value || span.replace(/[,\s]/g, "").includes(String(value));
  }
  if (typeof value !== "string") return true;
  const v = loose(value);
  if (v.length < 3) return true; // too short to discriminate
  if (loose(span).includes(v)) return true;
  if (/^[\d\s/.:-]+$/.test(normalise(value))) return true; // a reformatted date
  return v.length > 60; // a summary or an obligation, not a quote
}

/**
 * Verifies that every field's `sourceText` really appears in the document AND
 * that the span supports the value. A value the model could not ground is
 * forced to confidence 0 and flagged.
 *
 * Mutates `data` in place and returns only the counts — see `groundCheck`'s
 * callers, which rely on that.
 * This is the objective signal; the model's own confidence is advisory.
 */
export function groundCheck<T>(data: T, documentText: string): GroundStats {
  const haystack = normalise(documentText);
  const stats: GroundStats = { total: 0, present: 0, grounded: 0, ungrounded: 0 };

  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;

    if (isField(node)) {
      const f = node as Field<unknown>;
      stats.total++;
      f.confidence = Math.min(1, Math.max(0, Number(f.confidence) || 0));
      f.sourceText = typeof f.sourceText === "string" ? f.sourceText : "";

      if (f.value === null || f.value === "") {
        f.value = null;
        f.confidence = 0;
        f.ungrounded = false;
        return;
      }
      stats.present++;
      const needle = normalise(f.sourceText);
      const inDocument = needle.length > 0 && haystack.includes(needle);
      if (inDocument && spanSupportsValue(f.value, needle)) {
        f.ungrounded = false;
        stats.grounded++;
      } else {
        f.ungrounded = true;
        f.confidence = 0;
        stats.ungrounded++;
      }
      return;
    }
    Object.values(node).forEach(walk);
  };

  walk(data);
  return stats;
}
