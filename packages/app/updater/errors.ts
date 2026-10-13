/**
 * The code electron-updater gives the error it throws after downloading an
 * update whose code signature does not match the publisher name in
 * `app-update.yml`. Its message names the version too, but the version the
 * `update-available` event reported is the same one and needs no parsing.
 */
const INVALID_SIGNATURE_ERROR_CODE = "ERR_UPDATER_INVALID_SIGNATURE";

export function isInvalidSignatureError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === INVALID_SIGNATURE_ERROR_CODE
  );
}
