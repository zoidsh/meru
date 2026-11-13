import { randomUUID } from "node:crypto";
import { watch as watchPath } from "node:fs";
import type { FSWatcher } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FsPort } from "../../core/ports.ts";

const isMissing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export const createFs = (userDataDir: string): FsPort => {
  const pathOf = (name: string) => {
    if (name !== path.basename(name) || name === "." || name === "..") {
      throw new Error(`${name} is not a file name`);
    }
    return path.join(userDataDir, name);
  };

  return {
    exists: async (name) => {
      try {
        await stat(pathOf(name));
        return true;
      } catch (error) {
        if (isMissing(error)) {
          return false;
        }
        throw error;
      }
    },
    readText: async (name) => {
      const read = await readFile(pathOf(name), "utf-8")
        .then((text) => ({ text }))
        .catch((error: unknown) => {
          if (isMissing(error)) {
            return { text: undefined };
          }
          throw error;
        });
      return read.text;
    },
    userDataDir,
    // The directory is watched, not the file: an atomic write replaces the file with another, and a watch on the old one hears nothing after the first.
    watch: (name, listener) => {
      const target = path.basename(pathOf(name));
      let watcher: FSWatcher | undefined;
      try {
        watcher = watchPath(userDataDir, (_event, changed) => {
          if (changed === null || changed === target) {
            listener();
          }
        });
        watcher.on("error", () => {
          watcher?.close();
        });
      } catch {
        return () => {
          // The directory could not be watched, so there is nothing to stop.
        };
      }
      return () => {
        watcher?.close();
      };
    },
    // A rename within one directory replaces the target whole, so a crash mid-write leaves the old file rather than half a new one.
    writeTextAtomic: async (name, text) => {
      const target = pathOf(name);
      const temporary = `${target}.${randomUUID()}.tmp`;
      await mkdir(userDataDir, { recursive: true });
      try {
        await writeFile(temporary, text, "utf-8");
        await rename(temporary, target);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },
  };
};
