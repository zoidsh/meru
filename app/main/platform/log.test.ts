import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createFileLog, LOG_FILE, OLD_LOG_FILE } from "./log.ts";

const messageSchema = z.object({ message: z.string() });

const droppedSchema = z.object({
  fields: z.object({ dropped: z.number() }).optional(),
  message: z.string(),
});

const made: string[] = [];

const directory = async () => {
  const found = await mkdtemp(path.join(tmpdir(), "meru-log-"));
  made.push(found);
  return path.join(found, "logs");
};

const lines = async (file: string) => {
  const text = await readFile(file, "utf-8");
  return text
    .trim()
    .split("\n")
    .map((line) => messageSchema.parse(JSON.parse(line)).message);
};

describe(createFileLog, () => {
  afterEach(async () => {
    await Promise.all(
      made.splice(0).map(async (found) => {
        await rm(found, { force: true, recursive: true });
      })
    );
  });

  it("appends lines at or above its level in order, and moves the file aside once the next line would pass the cap", async () => {
    const logs = await directory();
    const log = createFileLog({
      cap: 200,
      directory: logs,
      minimum: "info",
      mirror: false,
      now: () => 0,
    });
    const inbox = log.scoped("inbox");
    inbox.debug("skipped");
    for (const message of ["one", "two", "three"]) {
      inbox.info(message);
    }
    await log.flush();
    expect({
      current: await lines(path.join(logs, LOG_FILE)),
      old: await lines(path.join(logs, OLD_LOG_FILE)),
    }).toStrictEqual({ current: ["three"], old: ["one", "two"] });
  });

  it("keeps at most the queue's cap of lines waiting, dropping the oldest and saying how many went", async () => {
    const logs = await directory();
    const log = createFileLog({
      directory: logs,
      minimum: "info",
      mirror: false,
      queueCap: 3,
    });
    const flood = log.scoped("flood");
    for (const message of ["1", "2", "3", "4", "5"]) {
      flood.info(message);
    }
    await log.flush();
    const text = await readFile(path.join(logs, LOG_FILE), "utf-8");
    expect(
      text
        .trim()
        .split("\n")
        .map((line) => droppedSchema.parse(JSON.parse(line)))
    ).toStrictEqual([
      {
        fields: { dropped: 2 },
        message: "Lines were dropped while the log fell behind",
      },
      { message: "3" },
      { message: "4" },
      { message: "5" },
    ]);
  });

  it("settles a flush only once the lines written while it waits are on disk too", async () => {
    const logs = await directory();
    const log = createFileLog({
      directory: logs,
      minimum: "info",
      mirror: false,
    });
    const quit = log.scoped("quit");
    quit.info("first");
    // Read synchronously the moment the flush settles, so a line still on its way cannot land before the read.
    const seen = log
      .flush()
      .then(() => readFileSync(path.join(logs, LOG_FILE), "utf-8"));
    quit.info("written during the flush");
    const text = await seen;
    expect(
      text
        .trim()
        .split("\n")
        .map((line) => messageSchema.parse(JSON.parse(line)).message)
    ).toStrictEqual(["first", "written during the flush"]);
  });
});
