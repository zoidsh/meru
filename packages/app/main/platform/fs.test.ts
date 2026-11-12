import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFs } from "./fs.ts";

const made: string[] = [];

const temporary = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "meru-fs-"));
  made.push(dir);
  return dir;
};

describe(createFs, () => {
  afterEach(async () => {
    await Promise.all(
      made.splice(0).map(async (dir) => {
        await rm(dir, { force: true, recursive: true });
      })
    );
  });

  it("writes a file whole and reads it back, leaving no temporary file", async () => {
    const dir = await temporary();
    const fs = createFs(path.join(dir, "user-data"));
    await expect(fs.exists("settings.json")).resolves.toBeFalsy();
    await expect(fs.readText("settings.json")).resolves.toBeUndefined();
    await fs.writeTextAtomic("settings.json", "one");
    await fs.writeTextAtomic("settings.json", "two");
    await expect(fs.readText("settings.json")).resolves.toBe("two");
    await expect(readdir(path.join(dir, "user-data"))).resolves.toStrictEqual([
      "settings.json",
    ]);
  });

  it("refuses a name that leaves the user data directory", async () => {
    const fs = createFs(await temporary());
    await expect(fs.readText("../settings.json")).rejects.toThrow(
      "../settings.json is not a file name"
    );
    await expect(fs.writeTextAtomic("..", "x")).rejects.toThrow(
      ".. is not a file name"
    );
  });
});
