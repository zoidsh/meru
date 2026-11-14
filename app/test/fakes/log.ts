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

/** A log for a test that expects nothing to go wrong: a warning or an error fails it where it is written. */
export const strictLog: LogPort = scopedLog((entry) => {
  if (entry.level === "warn" || entry.level === "error") {
    throw new Error(`${entry.message} ${JSON.stringify(entry.fields)}`);
  }
}, "strict");
