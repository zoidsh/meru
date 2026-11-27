import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { recordInto, silentLog } from "#core/log.fake.ts";
import { readTextUpTo } from "#platform/text-file.ts";

import {
  USER_STYLES_FILE_NAME,
  USER_STYLES_MAX_BYTES,
  createUserStyles,
} from "./user-styles.ts";

const folders: string[] = [];

const fileWith = async (contents?: string | Buffer) => {
  const folder = await mkdtemp(path.join(tmpdir(), "meru-user-styles-"));

  folders.push(folder);

  const file = path.join(folder, USER_STYLES_FILE_NAME);

  if (contents !== undefined) {
    await writeFile(file, contents);
  }

  return file;
};

const stylesOf = (file: string) => {
  const logs: string[] = [];
  const read = createUserStyles({
    read: () => readTextUpTo(file, USER_STYLES_MAX_BYTES),
    log: recordInto(logs),
  });

  return { read, logs };
};

describe(createUserStyles, () => {
  afterEach(async () => {
    await Promise.all(
      folders.splice(0).map((folder) => rm(folder, { recursive: true }))
    );
  });

  it("gives the file's text as it is now, read afresh each time", async () => {
    const file = await fileWith(".aeN { display: none }");
    const { read, logs } = stylesOf(file);

    await expect(read()).resolves.toBe(".aeN { display: none }");

    await writeFile(file, "/* ünïcode */ a { color: red }");

    await expect(read()).resolves.toBe("/* ünïcode */ a { color: red }");
    expect(logs).toStrictEqual([]);
  });

  it("leaves off a byte order mark at the start, and only there", async () => {
    const { read } = stylesOf(await fileWith("\uFEFFa { color: red }\uFEFF"));

    await expect(read()).resolves.toBe("a { color: red }\uFEFF");
  });

  it("gives nothing, quietly, when there is no file", async () => {
    const { read, logs } = stylesOf(await fileWith());

    await expect(read()).resolves.toBe("");
    expect(logs).toStrictEqual([]);
  });

  it("takes a file at the cap and gives nothing for one past it, logging its size alone", async () => {
    const atCap = stylesOf(await fileWith("a".repeat(USER_STYLES_MAX_BYTES)));

    await expect(atCap.read()).resolves.toHaveLength(USER_STYLES_MAX_BYTES);

    const past = stylesOf(
      await fileWith(`${"a".repeat(USER_STYLES_MAX_BYTES)}b`)
    );

    await expect(past.read()).resolves.toBe("");
    expect(past.logs).toStrictEqual([
      `user-styles-refused bytes=${USER_STYLES_MAX_BYTES + 1} most=${USER_STYLES_MAX_BYTES}`,
    ]);
  });

  it("gives nothing while the run may not apply them, reading no file, and the file's text again once it may", async () => {
    const file = await fileWith("a { color: red }");
    let allowed = false;
    const reads: string[] = [];
    const read = createUserStyles({
      read: () => {
        reads.push(file);

        return readTextUpTo(file, USER_STYLES_MAX_BYTES);
      },
      log: silentLog,
      allowed: () => allowed,
    });

    const free = await read();

    allowed = true;

    expect([free, reads.length, await read()]).toStrictEqual([
      "",
      0,
      "a { color: red }",
    ]);
  });

  it("gives nothing for what cannot be read, logging the error's code and not the path", async () => {
    const folder = await fileWith();
    const { read, logs } = stylesOf(path.dirname(folder));

    await expect(read()).resolves.toBe("");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(
      /^user-styles-read-failed error="[^"/]*\(E[A-Z]+\)"$/u
    );
  });
});
