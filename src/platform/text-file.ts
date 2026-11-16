import { readFile, rename, writeFile } from "node:fs/promises";

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
