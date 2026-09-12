"use client";

import { Check, Loader2 } from "lucide-react";
import type { Step } from "@/lib/extract";

const STEPS: { key: Step; label: string }[] = [
  { key: "reading", label: "Reading PDF" },
  { key: "extracting", label: "Extracting" },
  { key: "validating", label: "Validating" },
  { key: "grounding", label: "Grounding" },
];

export function Stepper({ done }: { done: Step[] }) {
  const current = STEPS.findIndex((s) => !done.includes(s.key));

  return (
    <ol
      aria-live="polite"
      aria-label="Extraction progress"
      className="mx-auto flex w-full max-w-md flex-col gap-2 rounded-lg border border-border bg-surface p-4"
    >
      {STEPS.map((s, i) => {
        const complete = done.includes(s.key);
        const active = i === current;
        return (
          <li key={s.key} className="flex items-center gap-2 text-[13px]">
            <span className="flex size-5 items-center justify-center">
              {complete ? (
                <Check aria-hidden="true" className="size-4" style={{ color: "var(--ok)" }} />
              ) : active ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin text-text-muted" />
              ) : (
                <span className="size-2 rounded-full bg-border" />
              )}
            </span>
            <span style={{ color: complete ? "var(--ok)" : active ? "var(--text)" : "var(--text-muted)" }}>
              {s.label}
            </span>
            <span className="sr-only">{complete ? "complete" : active ? "in progress" : "waiting"}</span>
          </li>
        );
      })}
    </ol>
  );
}
