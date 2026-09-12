"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Walks a rendered text layer and builds a whitespace-collapsed, lowercased
 * string plus a map from each character back to its DOM position — the same
 * normalisation the server-side grounding check uses, so a verified
 * `sourceText` can be located here.
 */
function indexTextLayer(layer: Element) {
  let norm = "";
  const map: { node: Text; offset: number }[] = [];
  // A TreeWalker, not querySelectorAll("span"): pdf.js nests spans for styled
  // runs, and their text would otherwise be missing from the index.
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    for (let i = 0; i < text.data.length; i++) {
      const ch = text.data[i]!;
      const c = /\s/.test(ch) ? " " : ch.toLowerCase();
      if (c === " " && (norm === "" || norm.endsWith(" "))) continue;
      norm += c;
      map.push({ node: text, offset: i });
    }
    if (norm && !norm.endsWith(" ")) {
      norm += " ";
      map.push({ node: text, offset: text.data.length });
    }
  }
  return { norm, map };
}

const needleOf = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function locate(layer: Element, sourceText: string) {
  const { norm, map } = indexTextLayer(layer);
  const needle = needleOf(sourceText);
  if (!needle) return null;
  let at = norm.indexOf(needle);
  let len = needle.length;
  if (at < 0 && needle.length > 24) {
    // The text layer breaks lines differently; a prefix still points at the right place.
    const prefix = needle.slice(0, 24);
    at = norm.indexOf(prefix);
    len = prefix.length;
  }
  if (at < 0) return null;
  const start = map[at];
  const end = map[Math.min(at + len - 1, map.length - 1)];
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, Math.min(end.offset + 1, end.node.data.length));
  return range;
}

export function DocPreview({
  file,
  sourceText,
  page: wantPage,
  pinned,
}: {
  file: File | string;
  /** Primitives, not an object: a fresh object each render would rebuild `paint`. */
  sourceText: string;
  page: number | null;
  pinned: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(0);
  const [rendered, setRendered] = useState(0);
  const [rects, setRects] = useState<Rect[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Must keep a stable identity: react-pdf restarts the text layer whenever this
  // callback changes, which cancels the render and leaves the layer empty.
  const onTextLayer = useCallback(() => setRendered((n) => n + 1), []);

  const paint = useCallback(() => {
    const stack = stackRef.current;
    const clear = () => setRects((r) => (r.length ? [] : r));
    if (!stack || !sourceText) return clear();

    const pages = [...stack.querySelectorAll<HTMLElement>("[data-page]")];
    // Try the cited page first, then anywhere — the model's page number can be wrong.
    const wanted = wantPage ? pages.filter((p) => p.dataset.page === String(wantPage)) : [];
    for (const page of [...wanted, ...pages]) {
      const layer = page.querySelector(".react-pdf__Page__textContent");
      if (!layer) continue;
      const range = locate(layer, sourceText);
      if (!range) continue;
      const base = page.getBoundingClientRect();
      const found = [...range.getClientRects()]
        .filter((r) => r.width > 0.5 && r.height > 0.5)
        .map((r) => ({
          top: r.top - base.top + page.offsetTop,
          left: r.left - base.left + page.offsetLeft,
          width: r.width,
          height: r.height,
        }));
      if (found.length) {
        setRects(found);
        return;
      }
    }
    clear();
  }, [sourceText, wantPage]);

  useEffect(() => {
    paint();
  }, [paint, rendered, width]);

  // Bring the cited span into view without moving anything else on the page.
  useEffect(() => {
    const first = rects[0];
    const el = scrollRef.current;
    if (!first || !el) return;
    const SLACK_ABOVE = 40; // px of drift tolerated before we bother scrolling
    const MARGIN_BELOW = 120; // keep the span clear of the export bar
    const target = first.top - el.clientHeight / 3;
    const visible =
      target >= el.scrollTop - SLACK_ABOVE &&
      target <= el.scrollTop + el.clientHeight - MARGIN_BELOW;
    if (!visible) el.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [rects]);

  return (
    <div
      ref={scrollRef}
      className="relative h-full min-h-80 overflow-auto rounded-lg border border-border bg-surface p-3"
      role="region"
      aria-label="Document preview. The extracted fields beside it are the accessible content."
    >
      {error ? (
        <p className="p-6 text-center text-text-muted">{error}</p>
      ) : (
        <div ref={stackRef} className="relative mx-auto w-fit" aria-hidden="true">
          <Document
            file={file}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={(e) => setError(e.message)}
            onSourceError={(e) => setError(e.message)}
            loading={<div className="p-10 text-center text-text-muted">Rendering…</div>}
          >
            {/* ponytail: every page renders eagerly (max 20). Lazy mounting would
                need the highlight to wait for the target page's text layer —
                virtualise only if large PDFs become a real complaint. */}
            {Array.from({ length: numPages }, (_, i) => (
              <div key={i} data-page={i + 1} className="relative mb-3 last:mb-0">
                <Page
                  pageNumber={i + 1}
                  width={width || undefined}
                  renderAnnotationLayer={false}
                  onRenderTextLayerSuccess={onTextLayer}
                  className="shadow-sm"
                />
              </div>
            ))}
          </Document>
          {rects.map((r, i) => (
            <div
              key={i}
              className="src-highlight"
              style={{
                top: r.top,
                left: r.left,
                width: r.width,
                height: r.height,
                borderStyle: pinned ? "solid" : "dashed",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
