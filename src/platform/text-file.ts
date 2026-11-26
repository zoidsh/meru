import { open, readFile, rename, rm, writeFile } from "node:fs/promises";

import { Mutex, noop, retry } from "es-toolkit";

export interface TextFile {
  readonly path: string;
  /** Nothing when the file does not exist. */
  read: () => Promise<string | undefined>;
  /**
   * Written beside the file, then renamed over it, so a crash leaves one
   * whole. Writes land in the order they were called.
   */
  write: (contents: string) => Promise<void>;
  /** Renames the file to `newPath`, keeping it. */
  moveTo: (newPath: string) => Promise<void>;
}

/** The calls a `TextFile` makes, taken as an argument so tests can fake them. */
export interface FileSystem {
  readFile: (path: string) => Promise<string>;
  /** Flushed to the disk before it resolves. */
  writeFile: (path: string, contents: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  /** Resolves when there was nothing to remove. */
  remove: (path: string) => Promise<void>;
}

export const nodeFileSystem: FileSystem = {
  readFile: (path) => readFile(path, "utf-8"),
  writeFile: (path, contents) =>
    writeFile(path, contents, { encoding: "utf-8", flush: true }),
  rename,
  remove: (path) => rm(path, { force: true }),
};

const codeOf = (error: unknown) =>
  error instanceof Error && "code" in error ? error.code : undefined;

const isMissing = (error: unknown) => codeOf(error) === "ENOENT";

/**
 * Windows refuses a rename over a file another process holds open, as a virus
 * scanner, backup tool or indexer does for a moment; graceful-fs retries the
 * same codes.
 */
const HELD_OPEN = new Set(["EPERM", "EBUSY", "EACCES"]);

/**
 * About a second of waiting in all, 1,060 ms: 10, 20, 40, 80 and 160 ms, then
 * 250 ms three times. graceful-fs keeps trying for a minute, too long to hold
 * every later change to the store behind a file that stays held.
 */
const RENAME_RETRIES = 8;
const renameDelay = (attempt: number) => Math.min(10 * 2 ** attempt, 250);

export const createTextFile = (
  path: string,
  fileSystem: FileSystem = nodeFileSystem
): TextFile => {
  const writes = new Mutex();

  return {
    path,
    read: async () => {
      try {
        return await fileSystem.readFile(path);
      } catch (error) {
        if (isMissing(error)) {
          return;
        }

        throw error;
      }
    },
    write: async (contents) => {
      const temporary = `${path}.tmp`;

      await writes.acquire();

      try {
        await fileSystem.writeFile(temporary, contents);
        await retry(() => fileSystem.rename(temporary, path), {
          retries: RENAME_RETRIES,
          delay: renameDelay,
          shouldRetry: (error) => HELD_OPEN.has(String(codeOf(error))),
        });
      } catch (error) {
        // The save's own error is the one to report, not a failed cleanup.
        await fileSystem.remove(temporary).catch(noop);

        throw error;
      } finally {
        writes.release();
      }
    },
    moveTo: (newPath) => fileSystem.rename(path, newPath),
  };
};

export type CappedRead =
  | { kind: "missing" }
  | { kind: "tooLarge"; bytes: number }
  | { kind: "read"; text: string };

/**
 * Reads a file of at most `maxBytes` as UTF-8; of a larger one, no more than
 * tells it is larger.
 */
export const readTextUpTo = async (
  path: string,
  maxBytes: number
): Promise<CappedRead> => {
  let file: Awaited<ReturnType<typeof open>>;

  try {
    file = await open(path, "r");
  } catch (error) {
    if (isMissing(error)) {
      return { kind: "missing" };
    }

    throw error;
  }

  try {
    const { size } = await file.stat();
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, maxBytes + 1, 0);

    return bytesRead > maxBytes
      ? { kind: "tooLarge", bytes: Math.max(size, bytesRead) }
      : { kind: "read", text: buffer.toString("utf-8", 0, bytesRead) };
  } finally {
    await file.close();
  }
};
