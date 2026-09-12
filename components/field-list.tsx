"use client";

import { isField, type Field } from "@/lib/schemas/field";
import { FieldRow, humanise } from "./field-row";
import { LineItemsTable } from "./line-items-table";

type Row = { name: string; field: Field<unknown> };
type Group = { title: string; rows: Row[]; items?: Record<string, Field<unknown>>[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const isFieldMap = (v: unknown): v is Record<string, Field<unknown>> =>
  isObject(v) && Object.values(v).length > 0 && Object.values(v).every(isField);

/** Collects the Field leaves of an object that is not a flat map of Fields. */
function flattenFields(obj: Record<string, unknown>, prefix = ""): Row[] {
  const out: Row[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const name = prefix ? `${prefix}.${k}` : k;
    if (isField(v)) out.push({ name, field: v });
    else if (isObject(v)) out.push(...flattenFields(v, name));
  }
  return out;
}

/** Turns any of the three schemas into ordered, titled groups of rows. */
function group(data: Record<string, unknown>): Group[] {
  const details: Group = { title: "Details", rows: [] };
  const rest: Group[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (isField(value)) {
      details.rows.push({ name: key, field: value });
    } else if (Array.isArray(value)) {
      if (key === "lineItems") {
        rest.push({
          title: "Line items",
          rows: [],
          items: value.filter(isFieldMap) as Record<string, Field<unknown>>[],
        });
      } else {
        value.forEach((entry, i) => {
          if (!isFieldMap(entry)) return;
          rest.push({
            title: `${humanise(key).replace(/ies$/, "y").replace(/s$/, "")} ${i + 1}`,
            rows: Object.entries(entry).map(([k, f]) => ({ name: k, field: f })),
          });
        });
      }
    } else if (isFieldMap(value)) {
      rest.push({
        title: humanise(key),
        rows: Object.entries(value).map(([k, f]) => ({ name: k, field: f })),
      });
    } else if (isObject(value)) {
      // A nested group the schema grew later: flatten rather than drop it, so the
      // UI can never show less than the JSON and CSV exports do.
      rest.push({ title: humanise(key), rows: flattenFields(value) });
    }
  }
  return [details, ...rest].filter((g) => g.rows.length || g.items?.length);
}

export function FieldList({
  data,
  active,
  pinned,
  onHover,
  onPin,
}: {
  data: Record<string, unknown>;
  active: Field<unknown> | null;
  pinned: Field<unknown> | null;
  onHover: (f: Field<unknown> | null) => void;
  onPin: (f: Field<unknown> | null) => void;
}) {
  const groups = group(data);
  let n = 0;

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="mb-1 px-3 font-mono text-[11px] tracking-wide text-text-muted uppercase">
            {g.title}
          </h3>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {g.items ? (
              <LineItemsTable
                items={g.items}
                total={(data.total as Field<unknown>) ?? null}
                active={active}
                pinned={pinned}
                onHover={onHover}
                onPin={onPin}
              />
            ) : (
              g.rows.map((r) => (
                <FieldRow
                  key={r.name}
                  name={r.name}
                  field={r.field}
                  index={n++}
                  active={r.field === active || r.field === pinned}
                  pinned={r.field === pinned}
                  onHover={onHover}
                  onPin={onPin}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
