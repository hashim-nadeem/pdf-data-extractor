"use client";

import type { DocType } from "@/lib/schemas";

const TYPES: { key: DocType; label: string }[] = [
  { key: "invoice", label: "Invoice" },
  { key: "cv", label: "CV" },
  { key: "contract", label: "Contract" },
];

export function SchemaPicker({
  value,
  onChange,
  disabled,
}: {
  value: DocType;
  onChange: (t: DocType) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Document type"
      className="flex rounded-lg border border-border bg-surface p-0.5"
    >
      {TYPES.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(t.key)}
            className="min-h-9 rounded-[7px] px-3 text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50"
            style={{
              background: on ? "var(--accent)" : "transparent",
              color: on ? "var(--accent-fg)" : "var(--text-muted)",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
