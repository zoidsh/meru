import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { CappedRead } from "#platform/text-file.ts";

/** v3's name and place, in the user data folder, so an upgrade keeps it. */
export const USER_STYLES_FILE_NAME = "gmail-user-styles.css";

export const USER_STYLES_MAX_BYTES = 256 * 1024;

export interface UserStylesDeps {
  /** Reads the file, at most `USER_STYLES_MAX_BYTES` of it. */
  read: () => Promise<CappedRead>;
  log: Log;
  /** Whether the run may apply them: `can("userStyles")`. */
  allowed?: () => boolean;
}

/**
 * The person's own CSS for Gmail's page, as the file holds it now: empty
 * when there is none, it is too large or it cannot be read. Only the size or
 * the error's code is logged, never the file's text or its path. Empty too,
 * with the file not even read, while the run may not apply them.
 */
export const createUserStyles =
  ({ read, log, allowed = () => true }: UserStylesDeps) =>
  async (): Promise<string> => {
    if (!allowed()) {
      return "";
    }

    let result: CappedRead;

    try {
      result = await read();
    } catch (error) {
      log("user-styles-read-failed", { error: scrub.error(error) });

      return "";
    }

    switch (result.kind) {
      case "missing": {
        return "";
      }
      case "tooLarge": {
        log("user-styles-refused", {
          bytes: result.bytes,
          most: USER_STYLES_MAX_BYTES,
        });

        return "";
      }
      default: {
        // Editors on Windows save one, and the page would read it as part of
        // the first selector.
        return result.text.replace(/^\uFEFF/u, "");
      }
    }
  };
