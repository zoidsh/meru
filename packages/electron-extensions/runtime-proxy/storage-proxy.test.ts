import { describe, expect, test } from "bun:test";
import type { WebFrameMain } from "electron";
import {
  isTrustedStorageCaller,
  parseStorageAccessLevelReport,
  parseStorageCall,
  parseStorageChangedReport,
  StorageAccessLevels,
} from "./storage-proxy";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const OTHER_EXTENSION_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function createFrame(url: string, isDestroyed = false) {
  return { url, isDestroyed: () => isDestroyed } as unknown as WebFrameMain;
}

describe("parseStorageCall", () => {
  test("takes a well-formed call and nothing else", () => {
    expect(parseStorageCall({ area: "session", method: "set", arguments: [{ a: 1 }] })).toEqual({
      area: "session",
      method: "set",
      arguments: [{ a: 1 }],
    });

    // A caller is the extension's own isolated world, but the shape it sends
    // is still its own word, so an area or a method outside the two lists —
    // and anything the relay would go on to `apply` a non-array to — is refused
    expect(parseStorageCall({ area: "cookies", method: "get", arguments: [] })).toBeUndefined();

    expect(parseStorageCall({ area: "local", method: "toString", arguments: [] })).toBeUndefined();

    expect(parseStorageCall({ area: "local", method: "get", arguments: "all" })).toBeUndefined();

    expect(parseStorageCall(null)).toBeUndefined();
  });
});

describe("parseStorageAccessLevelReport", () => {
  test("takes a known area and a known level", () => {
    expect(
      parseStorageAccessLevelReport({ area: "session", accessLevel: "TRUSTED_CONTEXTS" }),
    ).toEqual({ area: "session", accessLevel: "TRUSTED_CONTEXTS" });

    expect(
      parseStorageAccessLevelReport({ area: "session", accessLevel: "EVERYONE" }),
    ).toBeUndefined();

    expect(parseStorageAccessLevelReport(undefined)).toBeUndefined();
  });
});

describe("isTrustedStorageCaller", () => {
  test("a document on the extension's own origin is trusted, top-level or not", () => {
    expect(
      isTrustedStorageCaller(
        EXTENSION_ID,
        createFrame(`chrome-extension://${EXTENSION_ID}/popup.html`),
      ),
    ).toBe(true);

    // 1Password's inline menu is an iframe of the extension inside a web page,
    // and Chrome treats it as the extension page it is
    expect(
      isTrustedStorageCaller(
        EXTENSION_ID,
        createFrame(`chrome-extension://${EXTENSION_ID}/inline.html`),
      ),
    ).toBe(true);

    expect(
      isTrustedStorageCaller(EXTENSION_ID, createFrame(`chrome-extension://${EXTENSION_ID}`)),
    ).toBe(true);
  });

  test("a content script's page is not, whatever it looks like", () => {
    expect(isTrustedStorageCaller(EXTENSION_ID, createFrame("https://accounts.google.com/"))).toBe(
      false,
    );

    // Another extension's page, and a host that merely starts with the id
    expect(
      isTrustedStorageCaller(
        EXTENSION_ID,
        createFrame(`chrome-extension://${OTHER_EXTENSION_ID}/x.html`),
      ),
    ).toBe(false);

    expect(
      isTrustedStorageCaller(
        EXTENSION_ID,
        createFrame(`chrome-extension://${EXTENSION_ID}evil/x.html`),
      ),
    ).toBe(false);
  });

  test("a caller with no live frame is untrusted, which is the safe direction", () => {
    expect(isTrustedStorageCaller(EXTENSION_ID, undefined)).toBe(false);

    expect(
      isTrustedStorageCaller(
        EXTENSION_ID,
        createFrame(`chrome-extension://${EXTENSION_ID}/popup.html`, true),
      ),
    ).toBe(false);
  });
});

describe("StorageAccessLevels", () => {
  test("answers Chrome's own defaults until the worker says otherwise", () => {
    const accessLevels = new StorageAccessLevels();

    expect(accessLevels.get(EXTENSION_ID, "session")).toBe("TRUSTED_CONTEXTS");

    expect(accessLevels.get(EXTENSION_ID, "local")).toBe("TRUSTED_AND_UNTRUSTED_CONTEXTS");

    expect(accessLevels.get(EXTENSION_ID, "sync")).toBe("TRUSTED_AND_UNTRUSTED_CONTEXTS");

    expect(accessLevels.get(EXTENSION_ID, "managed")).toBe("TRUSTED_AND_UNTRUSTED_CONTEXTS");
  });

  test("keeps a level per extension and area, and loses them all with the session", () => {
    const accessLevels = new StorageAccessLevels();

    accessLevels.set(EXTENSION_ID, "local", "TRUSTED_CONTEXTS");

    expect(accessLevels.get(EXTENSION_ID, "local")).toBe("TRUSTED_CONTEXTS");

    expect(accessLevels.get(EXTENSION_ID, "sync")).toBe("TRUSTED_AND_UNTRUSTED_CONTEXTS");

    expect(accessLevels.get(OTHER_EXTENSION_ID, "local")).toBe("TRUSTED_AND_UNTRUSTED_CONTEXTS");

    accessLevels.clear();

    expect(accessLevels.get(EXTENSION_ID, "local")).toBe("TRUSTED_AND_UNTRUSTED_CONTEXTS");
  });
});

describe("parseStorageChangedReport", () => {
  const CHANGES = { unlocked: { oldValue: false, newValue: true } };

  test("takes a well-formed report and carries the changes through untouched", () => {
    expect(
      parseStorageChangedReport({
        area: "session",
        changes: CHANGES,
        accessLevel: "TRUSTED_CONTEXTS",
      }),
    ).toEqual({ area: "session", changes: CHANGES, accessLevel: "TRUSTED_CONTEXTS" });

    // A change with neither value is Chrome's own shape for a key cleared from
    // an area that never held it, and the values themselves are the
    // extension's to decide
    expect(
      parseStorageChangedReport({
        area: "local",
        changes: { a: {}, b: { newValue: null } },
        accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
      })?.changes,
    ).toEqual({ a: {}, b: { newValue: null } });
  });

  test("refuses anything it could not act on", () => {
    for (const report of [
      undefined,
      null,
      "local",
      { changes: CHANGES, accessLevel: "TRUSTED_CONTEXTS" },
      { area: "somewhere-else", changes: CHANGES, accessLevel: "TRUSTED_CONTEXTS" },
      { area: "local", accessLevel: "TRUSTED_CONTEXTS" },
      { area: "local", changes: "not an object", accessLevel: "TRUSTED_CONTEXTS" },
      // An array is an object, and is not a `changes`
      { area: "local", changes: [], accessLevel: "TRUSTED_CONTEXTS" },
      { area: "local", changes: CHANGES },
      { area: "local", changes: CHANGES, accessLevel: "SOMETHING_ELSE" },
    ]) {
      expect(parseStorageChangedReport(report)).toBeUndefined();
    }
  });
});
