import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";

import { logLine, logs, scopedLog } from "../../core/log.ts";
import type { LogEntry, LogLevel, LogPort } from "../../core/log.ts";

export const LOG_FILE = "main.log";

/** The previous file, kept whole once the current one passes the cap, so the log never holds more than twice the cap. */
export const OLD_LOG_FILE = "main.old.log";

/** About a week of a busy day's lines, and small enough to attach to a support email. */
export const LOG_CAP = 5 * 1024 * 1024;

export interface FileLogOptions {
  readonly directory: string;
  readonly minimum: LogLevel;
  /** Writes every line to the console as well, for a run from the repository. */
  readonly mirror: boolean;
  readonly cap?: number;
  readonly now?: () => number;
}

export interface FileLog {
  readonly scoped: (scope: string) => LogPort;
  /** Settles once every line is on disk, those written while it waits included, so a quit that flushes alongside other teardown keeps their lines. */
  readonly flush: () => Promise<void>;
}

const sizeOf = async (file: string) => {
  try {
    const found = await stat(file);
    return found.size;
  } catch {
    return 0;
  }
};

/** One rotating file of JSON lines in `directory`, written in order through one queue, so a burst of lines never interleaves or races a rotation. */
export const createFileLog = (options: FileLogOptions): FileLog => {
  const { directory, minimum, mirror } = options;
  const cap = options.cap ?? LOG_CAP;
  const now = options.now ?? Date.now;
  const file = path.join(directory, LOG_FILE);
  let written: Promise<number> = mkdir(directory, { recursive: true }).then(
    async () => await sizeOf(file)
  );
  const append = async (line: string, before: number) => {
    const bytes = Buffer.byteLength(line);
    let current = before;
    if (current > 0 && current + bytes > cap) {
      await rename(file, path.join(directory, OLD_LOG_FILE));
      current = 0;
    }
    await appendFile(file, line);
    return current + bytes;
  };
  const write = (entry: Omit<LogEntry, "time">) => {
    if (!logs(entry.level, minimum)) {
      return;
    }
    const line = logLine({ ...entry, time: now() });
    if (mirror) {
      const print = entry.level === "debug" ? "log" : entry.level;
      console[print](line.trimEnd());
    }
    // A line that cannot be written has nowhere else to go; the queue carries on with the next.
    written = written
      .catch(async () => await sizeOf(file))
      .then(async (current) => await append(line, current));
  };
  return {
    flush: async () => {
      let settled: Promise<number> | undefined;
      while (settled !== written) {
        settled = written;
        // oxlint-disable-next-line no-await-in-loop -- each wait is for the lines queued during the last one.
        await settled.catch(() => 0);
      }
    },
    scoped: (scope) => scopedLog(write, scope),
  };
};
