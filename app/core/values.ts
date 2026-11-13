import type { z } from "zod";

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Structural equality of JSON values, such as records, settings and snapshots; key order does not count. */
export const isEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((item, index) => isEqual(item, b[index]))
    );
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && isEqual(a[key], b[key]))
    );
  }
  return false;
};

/** The value at `key` of `data` as `schema` parses it; undefined when `data` is not an object or the value does not parse. */
export const pick = <S extends z.ZodType>(
  data: unknown,
  key: string,
  schema: S
): z.output<S> | undefined => {
  if (!isRecord(data)) {
    return undefined;
  }
  const parsed = schema.safeParse(data[key]);
  return parsed.success ? parsed.data : undefined;
};

/** What a thrown value says, for a report or a state that carries the message. */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
