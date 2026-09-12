"use client";

import type { Field } from "@/lib/schemas/field";
import { formatValue } from "./field-row";

type Item = Record<string, Field<unknown>>;

const COLS = [
  { key: "description", label: "Description", num: false },
  { key: "quantity", label: "Qty", num: true },
  { key: "unitPrice", label: "Unit price", num: true },
  { key: "total", label: "Total", num: true },
];

export function LineItemsTable({
  items,
  total,
  active,
  pinned,
  onHover,
  onPin,
}: {
  items: Item[];
  total?: Field<unknown> | null;
  active: Field<unknown> | null;
  pinned: Field<unknown> | null;
  onHover: (f: Field<unknown> | null) => void;
  onPin: (f: Field<unknown> | null) => void;
}) {
  if (!items.length) return null;

  const cell = (f: Field<unknown> | undefined) => {
    if (!f || f.value === null) return <span className="text-text-muted">—</span>;
    const on = f === active || f === pinned;
    return (
      <button
        type="button"
        onMouseEnter={() => onHover(f)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(f)}
        onBlur={() => onHover(null)}
        onClick={() => onPin(f === pinned ? null : f)}
        onKeyDown={(e) => e.key === "Escape" && onPin(null)}
        className="rounded px-1 py-0.5 text-left transition-colors duration-150 hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-ring"
        style={{
          background: on ? "color-mix(in oklch, var(--accent) 20%, transparent)" : undefined,
          textDecoration: f.ungrounded ? "underline dashed var(--bad)" : undefined,
        }}
      >
        {formatValue(f.value)}
      </button>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-[13px]">
        <caption className="sr-only">Invoice line items</caption>
        <thead>
          <tr className="border-b border-border">
            {COLS.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-2 py-2 text-[12px] font-medium text-text-muted ${c.num ? "text-right" : "text-left"}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          {items.map((item, i) => (
            <tr key={i} className="border-b border-border/60">
              {COLS.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 py-1.5 align-top ${c.num ? "text-right tabular-nums" : ""}`}
                >
                  {cell(item[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr className="border-t-2 border-border">
              <td className="px-2 py-2 font-sans text-text-muted" colSpan={3}>
                Total
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">{cell(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
