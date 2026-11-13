import type { z } from "zod";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The value at `key` of `data` as `schema` parses it; undefined when `data` is not an object or the value does not parse. */
export const parseField = <S extends z.ZodType>(
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
