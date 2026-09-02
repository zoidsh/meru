import { describe, expect, test } from "bun:test";
import {
  DEFAULT_STORAGE_ACCESS_LEVELS,
  refuseStorageCall,
  STORAGE_ACCESS_DENIED_ERROR,
  STORAGE_ACCESS_LEVEL_CONTEXT_ERROR,
  type RuntimeProxyStorageCall,
} from "./storage-protocol";

function call(overrides: Partial<RuntimeProxyStorageCall> = {}): RuntimeProxyStorageCall {
  return { area: "local", method: "get", arguments: [], ...overrides };
}

const OPEN = "TRUSTED_AND_UNTRUSTED_CONTEXTS";

const CLOSED = "TRUSTED_CONTEXTS";

describe("refuseStorageCall", () => {
  test("a trusted context is never refused, a closed area included", () => {
    expect(refuseStorageCall(call({ area: "session" }), true, CLOSED)).toBeUndefined();

    expect(
      refuseStorageCall(
        call({ method: "setAccessLevel", arguments: [{ accessLevel: CLOSED }] }),
        true,
        CLOSED,
      ),
    ).toBeUndefined();
  });

  test("a content script is held to the area's level", () => {
    expect(refuseStorageCall(call({ area: "session" }), false, CLOSED)).toBe(
      STORAGE_ACCESS_DENIED_ERROR,
    );

    expect(refuseStorageCall(call({ area: "local" }), false, OPEN)).toBeUndefined();

    // 1Password closes its persistent store, which Chrome leaves open
    expect(refuseStorageCall(call({ area: "local" }), false, CLOSED)).toBe(
      STORAGE_ACCESS_DENIED_ERROR,
    );

    // And an area the extension opened is reachable, whatever Chrome's default
    expect(refuseStorageCall(call({ area: "session" }), false, OPEN)).toBeUndefined();
  });

  test("a content script never sets an access level, whatever the area is at", () => {
    for (const accessLevel of [OPEN, CLOSED] as const) {
      expect(
        refuseStorageCall(
          call({ method: "setAccessLevel", arguments: [{ accessLevel: OPEN }] }),
          false,
          accessLevel,
        ),
      ).toBe(STORAGE_ACCESS_LEVEL_CONTEXT_ERROR);
    }
  });
});

/*
 * Chromium's own words and Chromium's own defaults, read from `storage_api.cc`
 * and `storage_utils.cc`. An extension matches on what it already handles and
 * relies on the defaults being what Chrome gives it, so a drift fails here
 * rather than in 1Password.
 */
test("the refusals are Chromium's own words", () => {
  expect(STORAGE_ACCESS_DENIED_ERROR).toBe("Access to storage is not allowed from this context.");

  expect(STORAGE_ACCESS_LEVEL_CONTEXT_ERROR).toBe("Context cannot set the storage access level");
});

test("the per-area defaults are Chromium's own", () => {
  expect(DEFAULT_STORAGE_ACCESS_LEVELS).toEqual({
    local: OPEN,
    session: CLOSED,
    sync: OPEN,
    managed: OPEN,
  });
});
