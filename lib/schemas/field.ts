import { z } from "zod";

/**
 * Every leaf value in every schema is wrapped in this envelope.
 * `sourceText` is the verbatim span the value was read from — see lib/grounding.ts.
 */
export type Field<T> = {
  value: T | null;
  confidence: number;
  sourceText: string;
  page: number | null;
  /** Set by the grounding check, not by the model. */
  ungrounded?: boolean;
};

const EMPTY = { value: null, confidence: 0, sourceText: "", page: null };

export const fieldOf = <T extends z.ZodType>(value: T) =>
  z
    .object({
      value: value.nullable(),
      confidence: z.number().default(0),
      sourceText: z.string().default(""),
      page: z.number().int().nullable().default(null),
    })
    .default(EMPTY as never);

export const str = () => fieldOf(z.string());
export const num = () => fieldOf(z.number());
export const bool = () => fieldOf(z.boolean());
export const strArr = () => fieldOf(z.array(z.string()));

export function isField(v: unknown): v is Field<unknown> {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "value" in v &&
    "confidence" in v &&
    "sourceText" in v
  );
}
