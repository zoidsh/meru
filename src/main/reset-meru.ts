import path from "node:path";

import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { UserDataFiles } from "#platform/user-data-files.ts";

import { LOG_FILE } from "./logger.ts";
import { SETTINGS_FILE_NAME } from "./settings.ts";
import { STATE_FILE_NAME } from "./state-store.ts";
import { USER_STYLES_FILE_NAME } from "./user-styles.ts";

/** Left in the user data folder by a reset, for the next launch to wipe it. */
export const RESET_MARKER = "reset-pending";

/**
 * What a reset deletes from the user data folder. `entitlement.json` stays,
 * as do Chromium's caches and its own files, which hold nothing of the
 * person's, and the downloads, which are the person's own.
 */
const WIPED = [
  // Every profile's session: cookies, storage, cache and spelling words, of
  // listed and unlisted profiles alike.
  "Partitions",
  STATE_FILE_NAME,
  SETTINGS_FILE_NAME,
  USER_STYLES_FILE_NAME,
  path.dirname(LOG_FILE),
  // The default session's, which the shell, Settings and the overlay's
  // documents load in: what a page stores, its cookies, and the zoom of
  // each of Meru's own pages, which Chromium keeps in `Preferences`.
  "Preferences",
  "Local Storage",
  "Session Storage",
  "IndexedDB",
  "WebStorage",
  "Cookies",
  "Cookies-journal",
  "Network",
];

const isWiped = (name: string) =>
  WIPED.includes(name) ||
  WIPED.some((wiped) => name === `${wiped}.tmp`) ||
  // A store set aside as unreadable, `<store>.corrupt-<ms>.json`.
  name.includes(".corrupt-");

interface Failure {
  path: string;
  error: unknown;
}

/**
 * Removes `target`; where that fails, as for a file another process still
 * holds, removes what it holds one by one, so one held file keeps itself
 * alone. Answers what stayed.
 */
const removeAll = (files: UserDataFiles, target: string): Failure[] => {
  try {
    files.remove(target);

    return [];
  } catch (error) {
    let names: string[];

    try {
      names = files.list(target);
    } catch {
      return [{ path: target, error }];
    }

    const left = names.flatMap((name) =>
      removeAll(files, path.join(target, name))
    );

    if (left.length > 0) {
      return left;
    }

    try {
      files.remove(target);

      return [];
    } catch (error_) {
      return [{ path: target, error: error_ }];
    }
  }
};

/**
 * After a reset, before any store is read and before any session exists:
 * deletes every setting and all data of the person's in the user data
 * folder, as files, so nothing a session would write back is left. The marker
 * goes last, so a wipe cut short runs again; a file that will not go is
 * logged and the launch goes on. Without the marker, nothing.
 */
export const wipeAfterReset = ({
  userDataPath,
  files,
  log,
}: {
  userDataPath: string;
  files: UserDataFiles;
  log: Log;
}) => {
  const marker = path.join(userDataPath, RESET_MARKER);

  if (!files.exists(marker)) {
    return false;
  }

  const failures = files
    .list(userDataPath)
    .filter(isWiped)
    .flatMap((name) => removeAll(files, path.join(userDataPath, name)));

  failures.push(...removeAll(files, marker));

  log("meru-reset-wiped", { kept: failures.length });

  for (const failure of failures) {
    log("reset-delete-failed", {
      path: scrub.path(failure.path),
      code: scrub.code(failure.error),
    });
  }

  return true;
};
