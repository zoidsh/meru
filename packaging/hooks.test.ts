import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeNotarizationKey } from "./hooks.ts";

const KEY =
  "-----BEGIN PRIVATE KEY-----\nnot a key\n-----END PRIVATE KEY-----\n";

describe(writeNotarizationKey, () => {
  let parent = "";

  beforeEach(async () => {
    parent = await mkdtemp(path.join(tmpdir(), "meru-hooks-test-"));
  });

  afterEach(async () => {
    await rm(parent, { force: true, recursive: true });
  });

  it("writes a key given as contents to a file and points the variable at it", async () => {
    const env: Record<string, string | undefined> = {
      APPLE_API_KEY: KEY,
      APPLE_API_KEY_ID: "ABC123",
    };
    const keyPath = writeNotarizationKey(env, parent) ?? "";
    expect(env.APPLE_API_KEY).toBe(keyPath);
    expect(path.basename(keyPath)).toBe("AuthKey_ABC123.p8");
    await expect(readFile(keyPath, "utf-8")).resolves.toBe(KEY);
  });

  // Windows has no POSIX permission bits to check.
  it.skipIf(process.platform === "win32")(
    "makes the file readable by its owner alone",
    async () => {
      const keyPath =
        writeNotarizationKey(
          { APPLE_API_KEY: KEY, APPLE_API_KEY_ID: "ABC123" },
          parent
        ) ?? "";
      const { mode } = await stat(keyPath);
      // oxlint-disable-next-line no-bitwise -- the permission bits of a mode.
      expect(mode & 0o777).toBe(0o600);
    }
  );

  it("leaves a path as it is", () => {
    const env = {
      APPLE_API_KEY: "/keys/AuthKey.p8",
      APPLE_API_KEY_ID: "ABC123",
    };
    expect(writeNotarizationKey(env, parent)).toBeUndefined();
    expect(env.APPLE_API_KEY).toBe("/keys/AuthKey.p8");
  });

  it("does nothing without a key", () => {
    const env: Record<string, string | undefined> = {};
    expect(writeNotarizationKey(env, parent)).toBeUndefined();
    expect(env).toStrictEqual({});
  });
});
