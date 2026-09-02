import { describe, expect, test } from "bun:test";
import type { WebFrameMain } from "electron";
import {
  STORAGE_ACCESS_DENIED_ERROR,
  STORAGE_ACCESS_LEVEL_CONTEXT_ERROR,
  type RuntimeProxyStorageCall,
} from "./storage-protocol";
import {
  isTrustedStorageCaller,
  parseStorageAccessLevelReport,
  parseStorageCall,
  refuseStorageCall,
  StorageAccessLevels,
} from "./storage-proxy";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const OTHER_EXTENSION_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function createFrame(url: string, isDestroyed = false) {
  return { url, isDestroyed: () => isDestroyed } as unknown as WebFrameMain;
}

function call(overrides: Partial<RuntimeProxyStorageCall> = {}): RuntimeProxyStorageCall {
  return { area: "local", method: "get", arguments: [], ...overrides };
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

describe("refuseStorageCall", () => {
  const accessLevels = new StorageAccessLevels();

  test("a trusted context is never refused, session storage included", () => {
    expect(
      refuseStorageCall({
        call: call({ area: "session" }),
        extensionId: EXTENSION_ID,
        isTrustedContext: true,
        accessLevels,
      }),
    ).toBeUndefined();

    expect(
      refuseStorageCall({
        call: call({ method: "setAccessLevel", arguments: [{ accessLevel: "TRUSTED_CONTEXTS" }] }),
        extensionId: EXTENSION_ID,
        isTrustedContext: true,
        accessLevels,
      }),
    ).toBeUndefined();
  });

  test("a content script meets Chrome's default: session closed, the rest open", () => {
    expect(
      refuseStorageCall({
        call: call({ area: "session" }),
        extensionId: EXTENSION_ID,
        isTrustedContext: false,
        accessLevels,
      }),
    ).toBe(STORAGE_ACCESS_DENIED_ERROR);

    expect(
      refuseStorageCall({
        call: call({ area: "local" }),
        extensionId: EXTENSION_ID,
        isTrustedContext: false,
        accessLevels,
      }),
    ).toBeUndefined();
  });

  test("a content script never sets an access level", () => {
    expect(
      refuseStorageCall({
        call: call({ method: "setAccessLevel", arguments: [{ accessLevel: "TRUSTED_CONTEXTS" }] }),
        extensionId: EXTENSION_ID,
        isTrustedContext: false,
        accessLevels,
      }),
    ).toBe(STORAGE_ACCESS_LEVEL_CONTEXT_ERROR);
  });

  test("the level the worker last set is what a content script is held to, either way", () => {
    const levels = new StorageAccessLevels();

    // 1Password closes its persistent store, which Chrome leaves open
    levels.set(EXTENSION_ID, "local", "TRUSTED_CONTEXTS");

    levels.set(EXTENSION_ID, "session", "TRUSTED_AND_UNTRUSTED_CONTEXTS");

    expect(
      refuseStorageCall({
        call: call({ area: "local" }),
        extensionId: EXTENSION_ID,
        isTrustedContext: false,
        accessLevels: levels,
      }),
    ).toBe(STORAGE_ACCESS_DENIED_ERROR);

    expect(
      refuseStorageCall({
        call: call({ area: "session" }),
        extensionId: EXTENSION_ID,
        isTrustedContext: false,
        accessLevels: levels,
      }),
    ).toBeUndefined();
  });
});

// Both refusals are Chromium's own words, from `storage_api.cc`. An extension
// matches on what it already handles, so a drift fails here rather than in
// 1Password
test("the refusals are Chromium's own words", () => {
  expect(STORAGE_ACCESS_DENIED_ERROR).toBe("Access to storage is not allowed from this context.");

  expect(STORAGE_ACCESS_LEVEL_CONTEXT_ERROR).toBe("Context cannot set the storage access level");
});
