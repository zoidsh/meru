import { open, readFile, rename, writeFile } from "node:fs/promises";

export interface TextFile {
  readonly path: string;
  /** Nothing when the file does not exist. */
  read: () => Promise<string | undefined>;
  /** Written beside the file, then renamed over it, so a crash leaves one whole. */
  write: (contents: string) => Promise<void>;
  /** Renames the file to `newPath`, keeping it. */
  moveTo: (newPath: string) => Promise<void>;
}

const isMissing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export const createTextFile = (path: string): TextFile => ({
  path,
  read: async () => {
    try {
      return await readFile(path, "utf-8");
    } catch (error) {
      if (isMissing(error)) {
        return;
      }

      throw error;
    }
  },
  write: async (contents) => {
    const temporary = `${path}.tmp`;

    await writeFile(temporary, contents, { encoding: "utf-8", flush: true });
    await rename(temporary, path);
  },
  moveTo: (newPath) => rename(path, newPath),
});

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
