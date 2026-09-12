"use client";

import { FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { DocType } from "@/lib/schemas";
import { Button } from "@/components/ui/button";

const SAMPLES: { type: DocType; label: string }[] = [
  { type: "invoice", label: "Sample invoice" },
  { type: "cv", label: "Sample CV" },
  { type: "contract", label: "Sample contract" },
];

export function Dropzone({
  onFile,
  onSample,
}: {
  onFile: (f: File) => void;
  onSample: (t: DocType) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        className="rounded-xl border-2 border-dashed p-10 text-center transition-colors duration-150"
        style={{
          borderColor: over ? "var(--accent)" : "var(--border)",
          background: over ? "color-mix(in oklch, var(--accent) 5%, transparent)" : "var(--surface)",
        }}
      >
        <Upload aria-hidden="true" className="mx-auto mb-3 size-6 text-text-muted" />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="rounded text-[15px] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Drop a PDF, or click to choose.
        </button>
        <p className="mt-2 text-[13px] text-text-muted">Processed in memory. Nothing is stored.</p>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label="Choose a PDF"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="text-[13px] text-text-muted">No PDF handy?</span>
        {SAMPLES.map((s) => (
          <Button
            key={s.type}
            variant="outline"
            size="sm"
              onClick={() => onSample(s.type)}
          >
            <FileText aria-hidden="true" className="size-3.5" />
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
