import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { noop } from "es-toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTextFile, nodeFileSystem, readTextUpTo } from "./text-file.ts";
import type { FileSystem } from "./text-file.ts";

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

const removeFolders = async () => {
  await Promise.all(
    folders.splice(0).map((made) => rm(made, { recursive: true }))
  );
};

describe(readTextUpTo, () => {
  afterEach(removeFolders);

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

const STORE = "/data/settings.json";

/** Shaped as Node's own: the code on the error and at the start of its message. */
const failure = (code: string, call: string) =>
  Object.assign(new Error(`${code}: ${call}`), { code });

/**
 * A directory in memory. Each rename takes the next code of `renameFails`
 * and fails with it, or moves the file once they run out; `writeFails`
 * leaves part of the file written, as a full disk does.
 */
const fakeDisk = () => {
  const files = new Map<string, string>();
  const renameFails: string[] = [];
  const writeFails: string[] = [];
  const renames: string[] = [];

  const fileSystem: FileSystem = {
    readFile: (file) => {
      const text = files.get(file);

      return text === undefined
        ? Promise.reject(failure("ENOENT", `open '${file}'`))
        : Promise.resolve(text);
    },
    readFileSync: (file) => {
      const text = files.get(file);

      if (text === undefined) {
        throw failure("ENOENT", `open '${file}'`);
      }

      return text;
    },
    writeFile: (file, contents) => {
      const code = writeFails.shift();

      if (code) {
        files.set(file, contents.slice(0, 1));

        return Promise.reject(failure(code, `write '${file}'`));
      }

      files.set(file, contents);

      return Promise.resolve();
    },
    rename: (from, to) => {
      const text = files.get(from);
      const code = renameFails.shift();

      renames.push(text ?? "(missing)");

      if (code) {
        return Promise.reject(failure(code, `rename '${from}' -> '${to}'`));
      }

      if (text === undefined) {
        return Promise.reject(failure("ENOENT", `rename '${from}' -> '${to}'`));
      }

      files.delete(from);
      files.set(to, text);

      return Promise.resolve();
    },
    remove: (file) => {
      files.delete(file);

      return Promise.resolve();
    },
  };

  return { files, renameFails, writeFails, renames, fileSystem };
};

/** Whether the promise is still pending once what is due now has run. */
const stateOf = async (promise: Promise<unknown>) => {
  let state = "pending";

  void promise.catch(noop).finally(() => {
    state = "settled";
  });
  await vi.advanceTimersByTimeAsync(0);

  return state;
};

describe(createTextFile, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves at once when the rename succeeds first time", async () => {
    const disk = fakeDisk();
    const saving = createTextFile(STORE, disk.fileSystem).write("one");

    await expect(stateOf(saving)).resolves.toBe("settled");
    await expect(saving).resolves.toBeUndefined();
    expect(disk.files).toStrictEqual(new Map([[STORE, "one"]]));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("saves the value when the rename fails twice with EPERM, as over a file held open", async () => {
    const disk = fakeDisk();

    disk.files.set(STORE, "before");
    disk.renameFails.push("EPERM", "EPERM");

    const saving = createTextFile(STORE, disk.fileSystem).write("after");

    await expect(stateOf(saving)).resolves.toBe("pending");
    await vi.advanceTimersByTimeAsync(30);
    await expect(saving).resolves.toBeUndefined();
    expect(disk.renames).toHaveLength(3);
    expect(disk.files).toStrictEqual(new Map([[STORE, "after"]]));
  });

  it("gives up after about a second of EBUSY, leaving the file as it was and no temporary one", async () => {
    const disk = fakeDisk();

    disk.files.set(STORE, "before");
    disk.renameFails.push(...Array.from({ length: 20 }, () => "EBUSY"));

    const saving = createTextFile(STORE, disk.fileSystem).write("after");

    await vi.advanceTimersByTimeAsync(1059);
    await expect(stateOf(saving)).resolves.toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    // The one error the caller logs, with the code in its message as Node's has.
    await expect(saving).rejects.toMatchObject({
      code: "EBUSY",
      message: expect.stringMatching(/^EBUSY: rename/u),
    });
    expect(disk.renames).toHaveLength(9);
    expect(disk.files).toStrictEqual(new Map([[STORE, "before"]]));
  });

  it("retries EACCES as it does EPERM and EBUSY", async () => {
    const disk = fakeDisk();

    disk.renameFails.push("EACCES");

    const saving = createTextFile(STORE, disk.fileSystem).write("one");

    await vi.advanceTimersByTimeAsync(10);
    await expect(saving).resolves.toBeUndefined();
    expect(disk.files).toStrictEqual(new Map([[STORE, "one"]]));
  });

  it("fails at once when the rename fails with any other code, leaving no temporary file", async () => {
    const disk = fakeDisk();

    disk.files.set(STORE, "before");
    disk.renameFails.push("ENOSPC");

    const saving = createTextFile(STORE, disk.fileSystem).write("after");

    await expect(stateOf(saving)).resolves.toBe("settled");
    await expect(saving).rejects.toMatchObject({ code: "ENOSPC" });
    expect(disk.renames).toHaveLength(1);
    expect(disk.files).toStrictEqual(new Map([[STORE, "before"]]));
  });

  it("fails at once when the disk is full, removing what it wrote of the temporary file", async () => {
    const disk = fakeDisk();

    disk.files.set(STORE, "before");
    disk.writeFails.push("ENOSPC");

    const saving = createTextFile(STORE, disk.fileSystem).write("after");

    await expect(stateOf(saving)).resolves.toBe("settled");
    await expect(saving).rejects.toMatchObject({ code: "ENOSPC" });
    expect(disk.renames).toHaveLength(0);
    expect(disk.files).toStrictEqual(new Map([[STORE, "before"]]));
  });

  it("lands a second save after a first still retrying, so the second's value stays", async () => {
    const disk = fakeDisk();
    const file = createTextFile(STORE, disk.fileSystem);

    disk.renameFails.push("EPERM", "EPERM", "EPERM");

    const first = file.write("first");
    const second = file.write("second");

    await vi.advanceTimersByTimeAsync(1000);
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(disk.renames).toStrictEqual([
      "first",
      "first",
      "first",
      "first",
      "second",
    ]);
    expect(disk.files).toStrictEqual(new Map([[STORE, "second"]]));
  });

  it("writes the next save after one that failed for good", async () => {
    const disk = fakeDisk();
    const file = createTextFile(STORE, disk.fileSystem);

    disk.renameFails.push("ENOSPC");

    const first = file.write("first");
    const second = file.write("second");

    await expect(first).rejects.toMatchObject({ code: "ENOSPC" });
    await expect(second).resolves.toBeUndefined();
    expect(disk.files).toStrictEqual(new Map([[STORE, "second"]]));
  });

  it("reads nothing for a missing file", async () => {
    await expect(
      createTextFile(STORE, fakeDisk().fileSystem).read()
    ).resolves.toBeUndefined();
  });
});

describe("createTextFile on the disk", () => {
  afterEach(removeFolders);

  it("writes over the file and leaves nothing beside it", async () => {
    const made = await folder();
    const file = createTextFile(path.join(made, "settings.json"));

    await expect(file.read()).resolves.toBeUndefined();
    await file.write("one");
    await file.write("two");

    await expect(file.read()).resolves.toBe("two");
    await expect(readdir(made)).resolves.toStrictEqual(["settings.json"]);
  });

  it("reads at once what is written, nothing for a missing file, and throws for a folder", async () => {
    const made = await folder();
    const file = createTextFile(path.join(made, "settings.json"));

    expect(file.readSync()).toBeUndefined();
    await file.write("one");
    expect(file.readSync()).toBe("one");
    expect(() => createTextFile(made).readSync()).toThrow(/EISDIR/u);
  });

  it("removes nothing, and fails nothing, when there is nothing to remove", async () => {
    const made = await folder();

    await expect(
      nodeFileSystem.remove(path.join(made, "none"))
    ).resolves.toBeUndefined();
  });
});
