import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLogFile } from "./log-file.ts";

let folder: string;

const line = (index: number) => `line ${String(index).padStart(4, "0")}\n`;

describe("the log file", () => {
  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "meru-log-"));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("is made with its folder and appended to in order", async () => {
    const file = createLogFile(path.join(folder, "logs", "main.log"));

    await Promise.all([file.append(line(1)), file.append(line(2))]);
    file.appendSync(line(3));

    await expect(readFile(file.file, "utf-8")).resolves.toBe(
      line(1) + line(2) + line(3)
    );
  });

  it("keeps the newer half once it passes the cap, through a file renamed over it", async () => {
    const file = createLogFile(path.join(folder, "main.log"), 100);

    for (let index = 0; index < 30; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one line after another
      await file.append(line(index));
    }

    const text = await readFile(file.file, "utf-8");

    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(100);
    expect(text).toMatch(/^line \d{4}\n(?:.*\n)*line 0029\n$/u);
    expect(text).not.toContain(line(0));
    await expect(readdir(folder)).resolves.toStrictEqual(["main.log"]);
  });

  it("counts what an earlier run left toward the cap", async () => {
    const first = createLogFile(path.join(folder, "main.log"), 100);

    for (let index = 0; index < 9; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one line after another
      await first.append(line(index));
    }

    const second = createLogFile(path.join(folder, "main.log"), 100);

    await second.append(line(9));
    await second.append(line(10));

    await expect(readFile(second.file, "utf-8")).resolves.not.toContain(
      line(0)
    );
  });

  it("copies what has been appended", async () => {
    const file = createLogFile(path.join(folder, "main.log"));
    const copy = path.join(folder, "copy.txt");

    void file.append(line(1));
    await file.copyTo(copy);

    await expect(readFile(copy, "utf-8")).resolves.toBe(line(1));
  });

  it("rejects a copy to a folder that is not there", async () => {
    const file = createLogFile(path.join(folder, "main.log"));

    await file.append(line(1));

    await expect(
      file.copyTo(path.join(folder, "missing", "copy.txt"))
    ).rejects.toThrow(/ENOENT/u);
  });
});
