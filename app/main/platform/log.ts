import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";

import { logLine, logs, scopedLog } from "../../core/log.ts";
import type { LogEntry, LogLevel, LogPort } from "../../core/log.ts";

export const LOG_FILE = "main.log";

/** The previous file, kept whole once the current one passes the cap, so the log never holds more than twice the cap. */
export const OLD_LOG_FILE = "main.old.log";

/** About a week of a busy day's lines, and small enough to attach to a support email. */
const LOG_CAP = 5 * 1024 * 1024;

/** The most lines waiting for the disk; past it the oldest go, so a flood, such as a page logging errors in a loop, costs a bounded amount of memory. */
const QUEUE_CAP = 2000;

interface FileLogOptions {
  readonly directory: string;
  readonly minimum: LogLevel;
  /** Writes every line to the console as well, for a run from the repository. */
  readonly mirror: boolean;
  readonly cap?: number;
  readonly queueCap?: number;
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

/** One rotating file of JSON lines in `directory`, written in order by one drain of a bounded queue, so a burst of lines never interleaves, races a rotation or outgrows memory. */
export const createFileLog = (options: FileLogOptions): FileLog => {
  const { directory, minimum, mirror } = options;
  const cap = options.cap ?? LOG_CAP;
  const queueCap = options.queueCap ?? QUEUE_CAP;
  const now = options.now ?? Date.now;
  const file = path.join(directory, LOG_FILE);
  const opened = mkdir(directory, { recursive: true }).then(
    async () => await sizeOf(file)
  );
  const queue: string[] = [];
  let dropped = 0;
  let draining = false;
  let drained: Promise<void> = Promise.resolve();
  // Lines go out in as few appends as the cap allows, the file moving aside before the line that would pass it.
  const append = async (lines: readonly string[], before: number) => {
    let current = before;
    let chunk: string[] = [];
    for (const line of lines) {
      const bytes = Buffer.byteLength(line);
      if (current > 0 && current + bytes > cap) {
        // oxlint-disable-next-line no-await-in-loop -- the lines before the rotation belong in the file that moves aside.
        await appendFile(file, chunk.join(""));
        // oxlint-disable-next-line no-await-in-loop -- as above
        await rename(file, path.join(directory, OLD_LOG_FILE));
        current = 0;
        chunk = [];
      }
      chunk.push(line);
      current += bytes;
    }
    await appendFile(file, chunk.join(""));
    return current;
  };
  const drain = async () => {
    draining = true;
    try {
      let current = await opened.catch(() => 0);
      while (queue.length > 0) {
        const lost =
          dropped === 0
            ? []
            : [
                logLine({
                  fields: { dropped },
                  level: "warn",
                  message: "Lines were dropped while the log fell behind",
                  scope: "log",
                  time: now(),
                }),
              ];
        dropped = 0;
        try {
          // oxlint-disable-next-line no-await-in-loop -- one write at a time keeps the lines in order and the size right for rotation.
          current = await append([...lost, ...queue.splice(0)], current);
        } catch {
          // A batch that cannot be written has nowhere else to go; the drain carries on with the next.
          // oxlint-disable-next-line no-await-in-loop -- as above
          current = await sizeOf(file);
        }
      }
    } finally {
      draining = false;
    }
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
    queue.push(line);
    if (queue.length > queueCap) {
      queue.shift();
      dropped += 1;
    }
    if (!draining) {
      drained = drain();
    }
  };
  return {
    flush: async () => {
      let settled: Promise<void> | undefined;
      while (settled !== drained) {
        settled = drained;
        // oxlint-disable-next-line no-await-in-loop -- each wait is for the lines queued during the last one.
        await settled;
      }
    },
    scoped: (scope) => scopedLog(write, scope),
  };
};
