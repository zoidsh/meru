import { expect } from "vitest";

import { scopedLog } from "../../core/log.ts";
import type { LogEntry, LogPort } from "../../core/log.ts";

/** A log that keeps every line in memory, for a test to read what was written. */
export class FakeLog {
  readonly entries: Omit<LogEntry, "time">[] = [];

  scoped(scope: string): LogPort {
    return scopedLog((entry) => {
      this.entries.push(entry);
    }, scope);
  }

  /** The messages written at `level`. */
  at(level: LogEntry["level"]): string[] {
    return this.entries
      .filter((entry) => entry.level === level)
      .map((entry) => entry.message);
  }
}

/** A log for a test that expects nothing to go wrong: a warning or an error fails the test, without throwing into the code that wrote it, which might catch the throw and carry on. */
export const strictLog: LogPort = scopedLog((entry) => {
  expect
    .soft(
      entry.level === "warn" || entry.level === "error"
        ? `${entry.message} ${JSON.stringify(entry.fields)}`
        : undefined,
      "a test given strictLog expects no warning or error"
    )
    .toBeUndefined();
}, "strict");
