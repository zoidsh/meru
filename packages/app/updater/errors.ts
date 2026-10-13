/**
 * The code electron-updater gives the error it throws after downloading an
 * update whose code signature does not match the publisher name in
 * `app-update.yml`. Its message names the version too, but the version the
 * `update-available` event reported is the same one and needs no parsing.
 */
const INVALID_SIGNATURE_ERROR_CODE = "ERR_UPDATER_INVALID_SIGNATURE";

function isInvalidSignatureError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === INVALID_SIGNATURE_ERROR_CODE
  );
}

/**
 * What an updater error is worth saying, and `null` for the errors a user has
 * nothing to do about: a background check that can't reach the feed is one
 * dropped connection, and the next check is three hours away.
 */
export function resolveUpdateErrorReport(
  error: unknown,
  { isManualCheck }: { isManualCheck: boolean },
) {
  if (isInvalidSignatureError(error)) {
    return "updateNotVerified" as const;
  }

  return isManualCheck ? ("checkFailed" as const) : null;
}
