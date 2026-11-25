import type { CappedRead } from "#platform/text-file.ts";

/** v3's name and place, in the user data folder, so an upgrade keeps it. */
export const USER_STYLES_FILE_NAME = "gmail-user-styles.css";

export const USER_STYLES_MAX_BYTES = 256 * 1024;

export interface UserStylesDeps {
  /** Reads the file, at most `USER_STYLES_MAX_BYTES` of it. */
  read: () => Promise<CappedRead>;
  log: (message: string) => void;
  /** Whether the run may apply them: `can("userStyles")`. */
  allowed?: () => boolean;
}

const codeOf = (error: unknown) =>
  error instanceof Error && "code" in error ? String(error.code) : "an error";

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
      log(`Gmail's user styles were not read: ${codeOf(error)}`);

      return "";
    }

    switch (result.kind) {
      case "missing": {
        return "";
      }
      case "tooLarge": {
        log(
          `Gmail's user styles were not applied: the file has ${result.bytes} bytes, more than ${USER_STYLES_MAX_BYTES}`
        );

        return "";
      }
      default: {
        // Editors on Windows save one, and the page would read it as part of
        // the first selector.
        return result.text.replace(/^\uFEFF/u, "");
      }
    }
  };
