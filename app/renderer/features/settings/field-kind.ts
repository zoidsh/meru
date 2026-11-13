import { z } from "zod";

/** How the settings page edits a value, read off its schema; `bespoke` is a value no field component edits, such as the shortcuts page's bindings. */
export type FieldKind =
  | { readonly kind: "boolean" }
  | { readonly kind: "choice"; readonly values: readonly string[] }
  | {
      readonly kind: "number";
      readonly min: number | undefined;
      readonly max: number | undefined;
      readonly step: number;
    }
  | { readonly kind: "text" }
  | { readonly kind: "list" }
  | { readonly kind: "bespoke" };

const bound = (value: number | null) =>
  value !== null && Number.isFinite(value) ? value : undefined;

export const fieldKindOf = (schema: z.ZodType): FieldKind => {
  if (schema instanceof z.ZodBoolean) {
    return { kind: "boolean" };
  }
  if (schema instanceof z.ZodEnum) {
    return {
      kind: "choice",
      values: schema.options.filter((value) => typeof value === "string"),
    };
  }
  if (schema instanceof z.ZodNumber) {
    return {
      kind: "number",
      max: bound(schema.maxValue),
      min: bound(schema.minValue),
      step: schema.format === "safeint" ? 1 : 0.1,
    };
  }
  if (schema instanceof z.ZodString) {
    return { kind: "text" };
  }
  if (schema instanceof z.ZodArray && schema.element instanceof z.ZodString) {
    return { kind: "list" };
  }
  return { kind: "bespoke" };
};
