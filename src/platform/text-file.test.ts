import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readTextUpTo } from "./text-file.ts";

const MAX = 8;

const folders: string[] = [];

const folder = async () => {
  const made = await mkdtemp(path.join(tmpdir(), "meru-text-file-"));

  folders.push(made);

  return made;
};

const fileWith = async (contents: string | Buffer) => {
  const file = path.join(await folder(), "file");

  await writeFile(file, contents);

  return file;
};

describe(readTextUpTo, () => {
  afterEach(async () => {
    await Promise.all(
      folders.splice(0).map((made) => rm(made, { recursive: true }))
    );
  });

  it("reads a file of exactly the cap, and tells one byte past it by its size", async () => {
    await expect(
      readTextUpTo(await fileWith("a".repeat(MAX)), MAX)
    ).resolves.toStrictEqual({ kind: "read", text: "a".repeat(MAX) });
    await expect(
      readTextUpTo(await fileWith("a".repeat(MAX + 1)), MAX)
    ).resolves.toStrictEqual({ kind: "tooLarge", bytes: MAX + 1 });
    await expect(
      readTextUpTo(await fileWith("a".repeat(MAX * 100)), MAX)
    ).resolves.toStrictEqual({ kind: "tooLarge", bytes: MAX * 100 });
  });

  it("counts the cap in bytes, not characters", async () => {
    await expect(
      readTextUpTo(await fileWith("ü".repeat(MAX / 2)), MAX)
    ).resolves.toStrictEqual({ kind: "read", text: "ü".repeat(MAX / 2) });
    await expect(
      readTextUpTo(await fileWith(`${"ü".repeat(MAX / 2)}a`), MAX)
    ).resolves.toStrictEqual({ kind: "tooLarge", bytes: MAX + 1 });
  });

  it("keeps a byte order mark, which is the reader's to drop", async () => {
    await expect(
      readTextUpTo(await fileWith("\uFEFFa"), MAX)
    ).resolves.toStrictEqual({ kind: "read", text: "\uFEFFa" });
  });

  it("tells a missing file, and throws for a folder", async () => {
    const made = await folder();

    await expect(
      readTextUpTo(path.join(made, "none"), MAX)
    ).resolves.toStrictEqual({ kind: "missing" });
    await expect(readTextUpTo(made, MAX)).rejects.toMatchObject({
      code: "EISDIR",
    });
  });
});
