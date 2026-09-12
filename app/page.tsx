"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/dropzone";
import { ExportBar } from "@/components/export-bar";
import { FieldList } from "@/components/field-list";
import { SchemaPicker } from "@/components/schema-picker";
import { StatBar } from "@/components/stat-bar";
import { Stepper } from "@/components/stepper";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ExtractResult, Step } from "@/lib/extract";
import type { DocType } from "@/lib/schemas";
import type { Field } from "@/lib/schemas/field";

const DocPreview = dynamic(() => import("@/components/doc-preview").then((m) => m.DocPreview), {
  ssr: false,
  loading: () => <div className="rounded-lg border border-border bg-surface p-10 text-center text-text-muted">Loading preview…</div>,
});

type Phase = "idle" | "working" | "done" | "error";

export default function Home() {
  const [type, setType] = useState<DocType>("invoice");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [hover, setHover] = useState<Field<unknown> | null>(null);
  const [pinned, setPinned] = useState<Field<unknown> | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinned(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const inFlight = useRef<AbortController | null>(null);

  const run = useCallback(async (f: File, t: DocType) => {
    inFlight.current?.abort(); // a second click supersedes the first
    const ctl = new AbortController();
    inFlight.current = ctl;

    setFile(f);
    setType(t);
    setPhase("working");
    setSteps([]);
    setResult(null);
    setError(null);
    setHover(null);
    setPinned(null);

    const body = new FormData();
    body.append("file", f);
    body.append("type", t);

    let res: Response;
    try {
      res = await fetch("/api/extract", { method: "POST", body, signal: ctl.signal });
    } catch {
      if (ctl.signal.aborted) return;
      setError({ message: "The request could not be sent. Check your connection." });
      return setPhase("error");
    }

    if (!res.ok || !res.body) {
      const e = (await res.json().catch(() => null)) as
        | { message?: string; detail?: string }
        | null;
      setError({ message: e?.message || "Something went wrong.", detail: e?.detail });
      return setPhase("error");
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let finished = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg:
            | { step: Step }
            | { result: ExtractResult }
            | { error: string; message: string; detail?: string };
          try {
            msg = JSON.parse(line);
          } catch {
            continue; // a mangled line is not worth failing the whole run over
          }
          if ("step" in msg) setSteps((s) => [...s, msg.step]);
          else if ("result" in msg) {
            setResult(msg.result);
            setPhase("done");
            finished = true;
          } else {
            setError({ message: msg.message, detail: msg.detail });
            setPhase("error");
            finished = true;
          }
        }
      }
    } catch {
      if (ctl.signal.aborted) return;
    }

    // A stream that ends without a result or an error means the server was cut
    // off mid-flight. Without this the stepper spins forever.
    if (!finished && !ctl.signal.aborted) {
      setError({ message: "The extraction was cut off before it finished. Try again." });
      setPhase("error");
    }
  }, []);

  const sample = useCallback(
    async (t: DocType) => {
      const res = await fetch(`/samples/${t}.pdf`);
      const blob = await res.blob();
      await run(new File([blob], `sample-${t}.pdf`, { type: "application/pdf" }), t);
    },
    [run],
  );

  const reset = () => {
    inFlight.current?.abort();
    setPhase("idle");
    setFile(null);
    setResult(null);
    setError(null);
  };

  const highlight = pinned ?? hover;

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3">
        <h1 className="mr-auto text-[15px] font-medium">
          Document <span className="text-text-muted">→</span> structured JSON
        </h1>
        <SchemaPicker value={type} onChange={setType} disabled={phase === "working"} />
        <ThemeToggle />
      </header>

      {phase === "done" && result && (
        <StatBar
          stats={result.stats}
          ms={result.ms}
          totalPages={result.totalPages}
          sampledPages={result.sampledPages}
        />
      )}

      <div className="flex-1 px-4 py-6">
        {phase === "idle" && <Dropzone onFile={(f) => run(f, type)} onSample={sample} />}

        {phase === "working" && <Stepper done={steps} />}

        {phase === "error" && error && (
          <div className="mx-auto max-w-lg rounded-lg border border-border bg-surface p-6 text-center">
            <p className="text-[15px]" style={{ color: "var(--bad)" }}>
              {error.message}
            </p>
            {error.detail && <p className="mt-2 font-mono text-[12px] text-text-muted">{error.detail}</p>}
            <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Try another file
            </Button>
          </div>
        )}

        {phase === "done" && result && file && (
          <div className="grid grid-cols-1 gap-6 min-[900px]:grid-cols-2">
            <div className="order-2 min-[900px]:order-1">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                aria-expanded={showPreview}
                className="mb-2 flex min-h-11 items-center gap-1 text-[13px] text-text-muted min-[900px]:hidden"
              >
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform duration-200"
                  style={{ transform: showPreview ? "rotate(0deg)" : "rotate(-90deg)" }}
                />
                Document preview
              </button>
              <div
                className={`${showPreview ? "block" : "hidden"} min-[900px]:block min-[900px]:sticky min-[900px]:top-4 min-[900px]:h-[calc(100dvh-8rem)]`}
              >
                <DocPreview
                  file={file}
                  sourceText={highlight?.sourceText ?? ""}
                  page={highlight?.page ?? null}
                  pinned={!!pinned}
                />
              </div>
            </div>

            <div className="order-1 min-[900px]:order-2">
              <p className="mb-3 px-3 text-[13px] text-text-muted">
                Hover a field to highlight its source. Click to pin it, Escape to clear.
              </p>
              <FieldList
                data={result.data as Record<string, unknown>}
                active={hover}
                pinned={pinned}
                onHover={setHover}
                onPin={setPinned}
              />
              <Button variant="outline" size="sm" className="mt-6 ml-3" onClick={reset}>
                <RotateCcw aria-hidden="true" className="size-3.5" />
                Extract another
              </Button>
            </div>
          </div>
        )}
      </div>

      {phase === "done" && result && (
        <ExportBar data={result.data} name={`${type}-extraction`} />
      )}

      <footer className="px-4 py-6 text-center text-[12px] text-text-muted">
        Parsed in memory and discarded. Nothing is stored, logged, or sent anywhere but the model.
      </footer>
    </main>
  );
}
