import { appendFileSync, mkdirSync, statSync } from "node:fs";
import {
  appendFile,
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { Mutex } from "es-toolkit";

import { keepNewerHalf } from "#core/log.ts";

/** About 2 MB, past which the older half of the log is dropped. */
export const LOG_CAP = 2 * 1024 * 1024;

/** Meru's log file. Every call may throw or reject; the logger ignores it. */
export interface LogFile {
  readonly file: string;
  /** After every earlier append; past the cap, keeps the newer half. */
  append: (text: string) => Promise<void>;
  /** For the quit and a crash, when nothing waits for a promise. */
  appendSync: (text: string) => void;
  /** A copy of the log as it stands once earlier appends have landed. */
  copyTo: (destination: string) => Promise<void>;
}

const sizeOf = async (file: string) => {
  try {
    const { size } = await stat(file);

    return size;
  } catch {
    return 0;
  }
};

export const createLogFile = (file: string, cap = LOG_CAP): LogFile => {
  const writes = new Mutex();
  let size: number | undefined;

  const locked = async (work: () => Promise<void>) => {
    await writes.acquire();

    try {
      await work();
    } finally {
      writes.release();
    }
  };

  return {
    file,
    append: (text) =>
      locked(async () => {
        size ??= await sizeOf(file);

        const bytes = Buffer.byteLength(text);

        if (size + bytes <= cap) {
          await mkdir(path.dirname(file), { recursive: true });
          await appendFile(file, text, "utf-8");
          size += bytes;

          return;
        }

        const before = await readFile(file, "utf-8").catch(() => "");
        const kept = keepNewerHalf(before + text, cap);
        const temporary = `${file}.tmp`;

        // Renamed over the log, so a crash mid-way leaves the old one whole.
        await writeFile(temporary, kept, "utf-8");
        await rename(temporary, file);
        size = Buffer.byteLength(kept);
      }),
    appendSync: (text) => {
      mkdirSync(path.dirname(file), { recursive: true });
      appendFileSync(file, text, "utf-8");
      ({ size } = statSync(file));
    },
    copyTo: (destination) =>
      locked(async () => {
        await copyFile(file, destination);
      }),
  };
};
