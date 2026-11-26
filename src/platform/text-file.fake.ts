import type { TextFile } from "./text-file.ts";

/**
 * The file at `path` in `files`, a directory held in memory by path. Like the
 * real one, moving a file that does not exist fails.
 */
export const fakeTextFile = (
  path: string,
  files: Map<string, string>
): TextFile => ({
  path,
  read: () => Promise.resolve(files.get(path)),
  readSync: () => files.get(path),
  write: (text) => {
    files.set(path, text);

    return Promise.resolve();
  },
  moveTo: (newPath) => {
    const text = files.get(path);

    if (text === undefined) {
      return Promise.reject(new Error("ENOENT"));
    }

    files.delete(path);
    files.set(newPath, text);

    return Promise.resolve();
  },
});
