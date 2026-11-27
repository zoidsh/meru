import { existsSync, readdirSync, rmSync } from "node:fs";

/**
 * The blocking calls the wipe after a reset makes, which runs before the app
 * is ready, when nothing may wait on a promise.
 */
export interface UserDataFiles {
  exists: (path: string) => boolean;
  /**
   * What a folder holds, each with whether it is a folder itself; a link,
   * a Windows junction included, never is. Throws for a file or a folder
   * that is not there.
   */
  list: (path: string) => { name: string; folder: boolean }[];
  /** A file, or a folder with all it holds; nothing when it is not there. */
  remove: (path: string) => void;
}

/**
 * Windows refuses to delete a file another process still holds open, as the
 * run that just quit can for a moment, or a virus scanner; Node retries on
 * those codes, here about a second in all: 100, 200, 300 and 400 ms.
 */
const RETRIES = { maxRetries: 4, retryDelay: 100 };

export const nodeUserDataFiles: UserDataFiles = {
  exists: existsSync,
  list: (path) =>
    readdirSync(path, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      folder: entry.isDirectory(),
    })),
  remove: (path) => {
    rmSync(path, { recursive: true, force: true, ...RETRIES });
  },
};
