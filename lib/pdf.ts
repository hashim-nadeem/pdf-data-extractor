import { extractText, getDocumentProxy } from "unpdf";
import { ExtractError } from "./errors";

/** A malformed env var must not silently remove the limit: NaN > x is false. */
const positive = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const MAX_MB = positive(process.env.MAX_FILE_MB, 10);
export const MAX_PAGES = positive(process.env.MAX_PAGES, 20);

/** Past this many pages we sample rather than send the whole document. */
const HEAD = 10;
const TAIL = 5;

export type PdfText = {
  totalPages: number;
  /** Page-tagged text of the pages actually sent to the model. */
  tagged: string;
  /** 1-based page numbers included, when the document was sampled. */
  sampledPages: number[] | null;
};

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  let pages: string[];
  let totalPages: number;
  try {
    const pdf = await getDocumentProxy(bytes);
    // Reject on page count before extracting text, so an oversized document
    // is not fully parsed just to be thrown away.
    if (pdf.numPages > MAX_PAGES)
      throw new ExtractError("too_many_pages", `${pdf.numPages} pages, limit ${MAX_PAGES}.`);
    const out = await extractText(pdf, { mergePages: false });
    totalPages = out.totalPages;
    pages = out.text;
  } catch (e) {
    if (e instanceof ExtractError) throw e;
    throw new ExtractError("unreadable");
  }

  const clean = pages.map((p) => (p ?? "").replace(/\s+\n/g, "\n").trim());
  if (clean.join("").replace(/\s/g, "").length < 20) throw new ExtractError("no_text_layer");

  // Long documents: first HEAD + last TAIL pages, and the UI says so.
  const keep =
    totalPages > HEAD + TAIL
      ? [...range(1, HEAD), ...range(totalPages - TAIL + 1, totalPages)]
      : range(1, totalPages);

  const tagged = keep.map((n) => `[page ${n}]\n${clean[n - 1] ?? ""}`).join("\n\n");
  return { totalPages, tagged, sampledPages: keep.length < totalPages ? keep : null };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function guardFile(file: File | null): asserts file is File {
  if (!file || file.size === 0) throw new ExtractError("no_file");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) throw new ExtractError("not_pdf");
  if (file.size > MAX_MB * 1024 * 1024)
    throw new ExtractError("too_large", `${(file.size / 1e6).toFixed(1)} MB, limit ${MAX_MB} MB.`);
}
