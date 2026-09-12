/**
 * Scores extraction against the committed ground truth and writes RESULTS.md.
 *
 *   npm run eval                  # every fixture, provider from .env
 *   npm run eval -- --type cv     # one document type
 *   npm run eval -- --limit 5     # a quick pass
 */
import fs from "node:fs";
import path from "node:path";
import type { ExtractError } from "../lib/errors";
import { extractDocument } from "../lib/extract";
import { extractPdfText } from "../lib/pdf";
import { modelName, provider } from "../lib/llm";
import { isField, type Field } from "../lib/schemas/field";
import { type DocType } from "../lib/schemas";

const DIR = path.resolve(process.cwd(), "evals/fixtures");

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

// ------------------------------------------------------------- comparison

// No `g` flag on the one used with .test(): a global regex advances lastIndex on
// every test, so repeated calls with the same input alternate. This is in the
// scoring path, so that would silently mis-score currency fields.
const CURRENCY = /[£$€]|\b(gbp|eur|usd)\b/i;
const CURRENCY_ALL = /[£$€]|\b(gbp|eur|usd)\b/gi;
const CODES: Record<string, string> = { "£": "gbp", $: "usd", "€": "eur" };

const text = (s: string) =>
  s.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]/g, "").trim();

const asNumber = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const n = Number(v.replace(/[£$€,%\s]/g, ""));
  return v.trim() === "" ? NaN : n;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Any of the formats the fixtures render dates in, back to YYYY-MM-DD. */
function asIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(s);
  if (m) {
    const mi = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  m = /^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s);
  if (m) {
    const mi = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  return null;
}

const set = (xs: unknown[]) => new Set(xs.map((x) => text(String(x))));

function equal(got: unknown, want: unknown): boolean {
  if (want === null || want === undefined) return got === null || got === undefined;
  if (got === null || got === undefined) return false;

  if (Array.isArray(want)) {
    const a = set(Array.isArray(got) ? got : [got]);
    const b = set(want);
    const hit = [...b].filter((x) => a.has(x)).length;
    const union = new Set([...a, ...b]).size;
    return union > 0 && hit / union >= 0.8; // near-match on list fields
  }
  if (typeof want === "boolean") return String(got).toLowerCase() === String(want);
  if (typeof want === "number") return Math.abs(asNumber(got) - want) < 0.011;

  const wantIso = asIsoDate(want);
  if (wantIso) return asIsoDate(got) === wantIso;

  const w = String(want);
  if (CURRENCY.test(w) && w.replace(CURRENCY_ALL, "").trim() === "") {
    const norm = (x: unknown) => (CODES[String(x).trim()] ?? text(String(x)));
    return norm(got) === norm(want); // GBP === £
  }
  return text(String(got)) === text(w);
}

// ---------------------------------------------------------------- flatten

function flatten(data: unknown): Map<string, Field<unknown>> {
  const out = new Map<string, Field<unknown>>();
  const walk = (node: unknown, p: string) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${p}[${i}]`));
    if (!node || typeof node !== "object") return;
    if (isField(node)) return void out.set(p, node as Field<unknown>);
    for (const [k, v] of Object.entries(node)) walk(v, p ? `${p}.${k}` : k);
  };
  walk(data, "");
  return out;
}

// ------------------------------------------------------------------ score

type Score = {
  fields: number; correct: number;
  presentGot: number; presentCorrect: number;
  absent: number; absentCorrect: number; hallucinated: number;
  grounded: number; groundable: number;
  docs: number; failed: number; ms: number;
};

const blank = (): Score => ({
  fields: 0, correct: 0, presentGot: 0, presentCorrect: 0,
  absent: 0, absentCorrect: 0, hallucinated: 0,
  grounded: 0, groundable: 0, docs: 0, failed: 0, ms: 0,
});

const add = (a: Score, b: Score) => {
  for (const k of Object.keys(a) as (keyof Score)[]) a[k] += b[k];
  return a;
};

const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);

/** Which fields actually miss, so the README can name them instead of guessing. */
const misses = new Map<string, { wrong: number; seen: number }>();
const tally = (type: DocType, path: string, ok: boolean) => {
  const key = `${type}.${path.replace(/\[\d+\]/g, "[]")}`;
  const m = misses.get(key) ?? { wrong: 0, seen: 0 };
  m.seen++;
  if (!ok) m.wrong++;
  misses.set(key, m);
};

async function scoreOne(file: string): Promise<Score> {
  const gt = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as {
    type: DocType; file: string; fields: Record<string, unknown>;
  };
  const s = blank();
  s.docs = 1;

  let result;
  try {
    const pdf = await extractPdfText(new Uint8Array(fs.readFileSync(path.join(DIR, gt.file))));
    // Free tiers rate-limit and overload; back off rather than scoring a zero.
    for (const wait of [0, 30_000, 60_000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        result = await extractDocument(gt.type, pdf);
        break;
      } catch (e) {
        const code = (e as ExtractError).code;
        if (code !== "quota" && code !== "busy") throw e;
        process.stdout.write(`  ${code}, backing off\n`);
        if (wait === 60_000) throw e;
      }
    }
  } catch (e) {
    // A provider outage is not an accuracy result: count it, but keep it out of the scores.
    s.failed = 1;
    const detail = (e as ExtractError).detail;
    process.stdout.write(`  ${gt.file}  FAILED  ${(e as Error).message}${detail ? ` — ${detail}` : ""}\n`);
    return s;
  }
  if (!result) return s;

  s.ms = result.ms;
  const got = flatten(result.data);
  s.grounded = result.stats.grounded;
  s.groundable = result.stats.present;

  for (const [p, want] of Object.entries(gt.fields)) {
    s.fields++;
    const value = got.get(p)?.value ?? null;
    const ok = equal(value, want);
    tally(gt.type, p, ok);
    if (ok) s.correct++;
    if (want === null) {
      s.absent++;
      if (value === null) s.absentCorrect++;
      else s.hallucinated++;
    }
    if (value !== null) {
      s.presentGot++;
      if (ok) s.presentCorrect++;
    }
  }
  // Fields the model invented that the document never had (e.g. extra line items).
  for (const [p, f] of got) {
    if (!Object.hasOwn(gt.fields, p) && f.value !== null) {
      s.absent++;
      s.hallucinated++;
    }
  }

  process.stdout.write(
    `  ${gt.file.padEnd(16)} ${pct(s.correct, s.fields).padStart(6)}  ${String(result.ms).padStart(6)} ms\n`,
  );
  return s;
}

// ------------------------------------------------------------------- main

async function main() {
  const only = arg("type");
  const limit = Number(arg("limit") ?? Infinity);
  const all_ = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && (!only || f.startsWith(only)))
    .sort();
  // Interleave the types so a run cut short by quota still covers all three.
  const files = all_
    .map((f, i) => ({ f, k: [Number(f.match(/(\d+)/)![1]), f] as const, i }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1].localeCompare(b.k[1]))
    .map((x) => x.f);

  const byType = new Map<DocType, Score>();
  const started = Date.now();
  let n = 0;

  for (const f of files) {
    if (n >= limit) break;
    n++;
    const type = f.split("-")[0] as DocType;
    const s = await scoreOne(f);
    byType.set(type, add(byType.get(type) ?? blank(), s));
  }

  const all = [...byType.values()].reduce((a, b) => add(a, b), blank());
  const row = (label: string, s: Score) =>
    `| ${label} | ${s.docs - s.failed} | ${pct(s.correct, s.fields)} | ${pct(s.presentCorrect, s.presentGot)} | ` +
    `${pct(s.absentCorrect, s.absent)} | ${pct(s.hallucinated, s.absent)} | ` +
    `${pct(s.grounded, s.groundable)} | ${s.docs > s.failed ? Math.round(s.ms / (s.docs - s.failed)) : 0} ms |`;

  const head =
    "| Set | Docs | Field accuracy | Precision on present | Null accuracy | Hallucination rate | Grounding pass | Mean latency |\n" +
    "|---|---|---|---|---|---|---|---|";

  const md = `# Eval results

Generated by \`npm run eval\` on ${new Date().toISOString().slice(0, 10)}.
Provider: **${provider()}**, model \`${modelName()}\`.
${n - all.failed} of ${n} fixtures scored over ${all.fields} labelled fields${
    all.failed
      ? `. ${all.failed} document(s) never reached the model (provider quota or outage) and are excluded from the scores rather than counted as wrong`
      : ""
  }.
Wall clock ${Math.round((Date.now() - started) / 1000)}s.

${head}
${[...byType.entries()].map(([t, s]) => row(t, s)).join("\n")}
${row("**all**", all)}

## Where it misses

${
    [...misses.entries()]
      .filter(([, m]) => m.wrong > 0)
      .sort((a, b) => b[1].wrong / b[1].seen - a[1].wrong / a[1].seen)
      .slice(0, 12)
      .map(([k, m]) => `- \`${k}\` — wrong on ${m.wrong} of ${m.seen}`)
      .join("\n") || "- Nothing missed on this run."
  }

## How these are measured

- **Field accuracy** — correct / total labelled fields, after normalising case, whitespace,
  currency symbols, thousands separators and date formats. List fields (skills, obligations)
  count as correct at 80% set overlap or better.
- **Precision on present** — of the fields the model returned non-null, how many were right.
- **Null accuracy** — of the fields genuinely absent from the document, how many came back null.
- **Hallucination rate** — of those absent fields, how many got a value anyway. Extra array
  entries the document never contained count here too.
- **Grounding pass** — fields whose \`sourceText\` was found verbatim in the document text.
  This is checked in code on every request, not just in the eval.
- Ground truth is generated alongside each fixture, so it is exact by construction.

Fixtures are synthetic and visibly marked \`SAMPLE — NOT A REAL DOCUMENT\`.
Regenerate them with \`npm run fixtures\`.
`;

  fs.writeFileSync(path.resolve(process.cwd(), "evals/RESULTS.md"), md);
  process.stdout.write(`\n${head}\n${row("all", all)}\n\nWrote evals/RESULTS.md\n`);
}

main();
