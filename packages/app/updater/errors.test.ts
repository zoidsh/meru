import { describe, expect, test } from "bun:test";
import { isInvalidSignatureError } from "./errors";

/** The error electron-updater throws when the downloaded signature is wrong. */
function invalidSignatureError() {
  const error = new Error(
    "New version 3.64.0 is not signed by the application owner: publisherNames: Zoid Ltd, raw info: ...",
  );

  Object.assign(error, { code: "ERR_UPDATER_INVALID_SIGNATURE" });

  return error;
}

describe("isInvalidSignatureError", () => {
  test("recognizes the signature error by its code", () => {
    expect(isInvalidSignatureError(invalidSignatureError())).toBe(true);
  });

  test("ignores another updater error", () => {
    const error = new Error("Cannot find channel file");

    Object.assign(error, { code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" });

    expect(isInvalidSignatureError(error)).toBe(false);
  });

  test("ignores an error with no code, whatever it says", () => {
    expect(isInvalidSignatureError(new Error("net::ERR_INTERNET_DISCONNECTED"))).toBe(false);
    expect(
      isInvalidSignatureError(
        new Error("New version 3.64.0 is not signed by the application owner"),
      ),
    ).toBe(false);
  });

  test("ignores what is not an error at all", () => {
    expect(isInvalidSignatureError(null)).toBe(false);
    expect(isInvalidSignatureError(undefined)).toBe(false);
    expect(isInvalidSignatureError("ERR_UPDATER_INVALID_SIGNATURE")).toBe(false);
  });
});
