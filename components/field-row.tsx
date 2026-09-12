"use client";

import { AlertTriangle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { Field } from "@/lib/schemas/field";
import { ConfidenceMeter } from "./confidence-meter";

const OVERRIDES: Record<string, string> = {
  taxId: "Tax ID",
  invoiceNumber: "Invoice №",
  email: "Email",
  autoRenew: "Auto-renew",
};

export const humanise = (key: string) =>
  OVERRIDES[key] ??
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

export function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export function FieldRow({
  name,
  field,
  index,
  active,
  pinned,
  onHover,
  onPin,
}: {
  name: string;
  field: Field<unknown>;
  index: number;
  active: boolean;
  pinned: boolean;
  onHover: (f: Field<unknown> | null) => void;
  onPin: (f: Field<unknown> | null) => void;
}) {
  const reduced = useReducedMotion();
  const empty = field.value === null;
  const ungrounded = !!field.ungrounded;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, transform: "translateY(4px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.04, 0.6), ease: "easeOut" }}
      className="border-b border-border last:border-b-0"
    >
      <button
        type="button"
        // aria-disabled, not disabled: a null field has nothing to pin but must
        // stay in the tab order, or a keyboard user never hears it exists.
        aria-disabled={empty}
        aria-pressed={pinned}
        onMouseEnter={() => !empty && onHover(field)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => !empty && onHover(field)}
        onBlur={() => onHover(null)}
        onClick={() => !empty && onPin(pinned ? null : field)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onPin(null);
        }}
        className="flex w-full min-h-11 items-center gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring aria-disabled:cursor-default aria-disabled:hover:bg-transparent"
        style={
          ungrounded
            ? { borderLeft: "2px dashed var(--bad)" }
            : active
              ? { borderLeft: "2px solid var(--accent)" }
              : { borderLeft: "2px solid transparent" }
        }
      >
        <span className="w-36 shrink-0 text-[13px] text-text-muted">{humanise(name)}</span>
        <span className="min-w-0 flex-1 break-words font-mono text-[13px]">
          {empty ? <span className="text-text-muted">—</span> : formatValue(field.value)}
        </span>
        {ungrounded && (
          <span
            className="flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px]"
            style={{ color: "var(--bad)", borderColor: "var(--bad)" }}
            title="The model returned a value that doesn't appear in the document. Treat as unverified."
          >
            <AlertTriangle aria-hidden="true" className="size-3" />
            ungrounded
            {/* `title` alone never reaches a keyboard or screen-reader user, and the
                row is already a button, so a tooltip trigger cannot nest here. */}
            <span className="sr-only">
              : the model returned a value that does not appear in the document. Treat as
              unverified.
            </span>
          </span>
        )}
        {!empty && <ConfidenceMeter confidence={field.confidence} ungrounded={ungrounded} />}
        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-text-muted tabular-nums">
          {field.page ? `p${field.page}` : ""}
        </span>
      </button>

      {pinned && !empty && (
        <div className="mx-3 mb-2 rounded-md border border-border bg-bg p-2">
          <p className="mb-1 font-mono text-[11px] text-text-muted">
            source · page {field.page ?? "?"} · confidence {field.confidence.toFixed(2)}
          </p>
          <p className="font-mono text-[12px] leading-relaxed break-words">
            {field.sourceText || <span className="text-text-muted">no span returned</span>}
          </p>
        </div>
      )}
    </motion.div>
  );
}
