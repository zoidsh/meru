import { noop } from "es-toolkit";

import { formatLine, formatRunLine } from "#core/log.ts";
import type { Log, LogContext, RunInfo } from "#core/log.ts";
import type { LogFile } from "#platform/log-file.ts";

/** Where in the user data folder the log is. */
export const LOG_FILE = "logs/main.log";

/** How long a line waits in memory before it is written with the rest. */
export const FLUSH_AFTER = 1000;

const NO_PROFILES: LogContext["profiles"] = () => [];

export interface LoggerDeps {
  file: LogFile;
  context: Omit<LogContext, "profiles">;
  now: () => Date;
  /** Each line as it is made, as `console.error` prints it. */
  echo: (line: string) => void;
}

export interface Logger {
  log: Log;
  /** The line a run starts with. */
  started: (info: RunInfo) => void;
  /** Where each profile is in the row, once the state is read. */
  follow: (profiles: LogContext["profiles"]) => void;
  /** Writes what waits; never rejects. */
  flush: () => Promise<void>;
  /** As `flush`, blocking: for the quit and a crash. */
  flushSync: () => void;
  /** A copy of everything logged so far; rejects when it was not made. */
  copyTo: (destination: string) => Promise<void>;
}

/**
 * The one log of main: each line printed at once and written to the file a
 * moment later with whatever followed it, so no line blocks on the disk. A
 * failed write loses its lines and tells no one.
 */
export const createLogger = ({
  file,
  context,
  now,
  echo,
}: LoggerDeps): Logger => {
  let profiles: LogContext["profiles"] = NO_PROFILES;
  let waiting: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const take = () => {
    clearTimeout(timer);
    timer = undefined;

    const text = waiting.length === 0 ? "" : `${waiting.join("\n")}\n`;

    waiting = [];

    return text;
  };

  const flush = async () => {
    const text = take();

    if (text !== "") {
      await file.append(text).catch(noop);
    }
  };

  const add = (line: string) => {
    echo(line);
    waiting.push(line);
    timer ??= setTimeout(() => {
      void flush();
    }, FLUSH_AFTER);
    // The quit flushes; the timer must not hold it back.
    timer.unref?.();
  };

  const log = ((name: string, fields: Record<string, unknown> = {}) => {
    add(formatLine(now(), { name, fields }, { ...context, profiles }));
  }) as Log;

  return {
    log,
    started: (info) => {
      add(formatRunLine(now(), info, context));
    },
    follow: (read) => {
      profiles = read;
    },
    flush,
    flushSync: () => {
      const text = take();

      if (text !== "") {
        try {
          file.appendSync(text);
        } catch {
          // A log that cannot be written is not worth breaking the quit for.
        }
      }
    },
    copyTo: async (destination) => {
      await flush();
      await file.copyTo(destination);
    },
  };
};
