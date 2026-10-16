import { describe, expect, test } from "bun:test";
import { resolveUpdateErrorReport } from "./errors";

function updaterError(message: string, code?: string) {
  const error = new Error(message);

  if (code) {
    Object.assign(error, { code });
  }

  return error;
}

/** The error electron-updater throws when the downloaded signature is wrong. */
const invalidSignatureError = updaterError(
  "New version 3.64.0 is not signed by the application owner: publisherNames: Zoid Ltd",
  "ERR_UPDATER_INVALID_SIGNATURE",
);

describe("resolveUpdateErrorReport", () => {
  test("reports an unverified update, whichever check downloaded it", () => {
    expect(resolveUpdateErrorReport(invalidSignatureError, { isManualCheck: false })).toBe(
      "updateNotVerified",
    );
    expect(resolveUpdateErrorReport(invalidSignatureError, { isManualCheck: true })).toBe(
      "updateNotVerified",
    );
  });

  test("reports any other error only to whoever asked for the check", () => {
    const error = updaterError("net::ERR_INTERNET_DISCONNECTED");

    expect(resolveUpdateErrorReport(error, { isManualCheck: true })).toBe("checkFailed");
    expect(resolveUpdateErrorReport(error, { isManualCheck: false })).toBe(null);
  });

  test("tells another updater error code apart from the signature one", () => {
    const error = updaterError("Cannot find channel file", "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND");

    expect(resolveUpdateErrorReport(error, { isManualCheck: false })).toBe(null);
  });

  test("goes by the code rather than the message", () => {
    const error = updaterError("New version 3.64.0 is not signed by the application owner");

    expect(resolveUpdateErrorReport(error, { isManualCheck: false })).toBe(null);
  });

  test("takes what is not an error at all as any other failure", () => {
    expect(resolveUpdateErrorReport(null, { isManualCheck: true })).toBe("checkFailed");
    expect(resolveUpdateErrorReport(undefined, { isManualCheck: false })).toBe(null);
    expect(
      resolveUpdateErrorReport("ERR_UPDATER_INVALID_SIGNATURE", { isManualCheck: false }),
    ).toBe(null);
  });
});
