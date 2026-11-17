import type { CappedRead } from "#platform/text-file.ts";

/** v3's name and place, in the user data folder, so an upgrade keeps it. */
export const USER_STYLES_FILE_NAME = "gmail-user-styles.css";

export const USER_STYLES_MAX_BYTES = 256 * 1024;

export interface UserStylesDeps {
  /** Reads the file, at most `USER_STYLES_MAX_BYTES` of it. */
  read: () => Promise<CappedRead>;
  log: (message: string) => void;
}

const codeOf = (error: unknown) =>
  error instanceof Error && "code" in error ? String(error.code) : "an error";

/**
 * The person's own CSS for Gmail's page, as the file holds it now: empty
 * when there is none, it is too large or it cannot be read. Only the size or
 * the error's code is logged, never the file's text or its path.
 */
export const createUserStyles =
  ({ read, log }: UserStylesDeps) =>
  async (): Promise<string> => {
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
        return result.text;
      }
    }
  };
