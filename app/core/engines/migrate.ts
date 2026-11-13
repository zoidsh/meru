import { z } from "zod";

import { err, ok } from "../result.ts";
import type { Result } from "../result.ts";

/** Takes a file's data from one version to the next. */
export type Migration = (data: unknown) => unknown;

export const envelopeSchema = z.object({
  data: z.unknown(),
  version: z.number().int().min(1),
});

export type MigrationError = "newer" | "failed";

/**
 * Runs the ladder from the file's version to `current`; `ladder[0]` takes version 1 to 2. A file from a newer version is refused rather than read as this one.
 */
export const migrate = (
  data: unknown,
  from: number,
  current: number,
  ladder: readonly Migration[]
): Result<unknown, MigrationError> => {
  if (from > current) {
    return err("newer");
  }
  let migrated = data;
  try {
    for (const step of ladder.slice(from - 1, current - 1)) {
      migrated = step(migrated);
    }
  } catch {
    return err("failed");
  }
  return ok(migrated);
};
