import { z } from "zod/mini";

/** What reading a store's file came to. */
export type Decoded<T> =
  | { kind: "read"; value: T }
  /** A later Meru wrote it; nothing here may read it or write over it. */
  | { kind: "newer"; version: number }
  | { kind: "unreadable"; reason: string };

const readVersion = (value: unknown) =>
  typeof value === "object" && value !== null && "version" in value
    ? value.version
    : undefined;

/**
 * A store's file checked at its top level only: a newer integer version
 * stops, and anything `schema` refuses, a version no Meru wrote included, is
 * unreadable. What lies below is the store's to read leniently.
 */
export const decodeVersioned = <Schema extends z.ZodMiniType>(
  value: unknown,
  version: number,
  schema: Schema
): Decoded<z.output<Schema>> => {
  const found = readVersion(value);

  if (Number.isInteger(found) && Number(found) > version) {
    return { kind: "newer", version: Number(found) };
  }

  const result = schema.safeParse(value);

  return result.success
    ? { kind: "read", value: result.data }
    : { kind: "unreadable", reason: z.prettifyError(result.error) };
};
