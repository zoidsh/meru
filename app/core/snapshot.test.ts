import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FakeClock } from "../test/fakes/clock.ts";
import { FakeFs } from "../test/fakes/fs.ts";
import { FakeLifecycle } from "../test/fakes/lifecycle.ts";
import { FakeLog, strictLog } from "../test/fakes/log.ts";
import version1 from "./fixtures/snapshot-v1.json" with { type: "json" };
import { SnapshotStore } from "./snapshot.ts";

const NAME = "people.json";

const schema = z.object({ names: z.array(z.string()) });

type People = z.infer<typeof schema>;

const EMPTY: People = { names: [] };

// Version 1 held one name; version 2 holds a list.
const toVersion2 = (data: unknown): unknown => {
  const parsed = z.object({ name: z.string() }).parse(data);
  return { names: [parsed.name] };
};

const setup = (files: Readonly<Record<string, string>> = {}) => {
  const fs = new FakeFs(files);
  const clock = new FakeClock();
  const lifecycle = new FakeLifecycle();
  const log = new FakeLog();
  const store = new SnapshotStore<People, string>(
    {
      delay: 100,
      migrations: [toVersion2],
      name: NAME,
      recover: (data) => {
        const names = z.object({ names: z.array(z.unknown()) }).safeParse(data);
        if (!names.success) {
          return {
            fallbacks: data === undefined ? [] : ["names"],
            value: EMPTY,
          };
        }
        const kept = names.data.names.filter(
          (name): name is string => typeof name === "string"
        );
        return {
          fallbacks: kept.length === names.data.names.length ? [] : ["names"],
          value: { names: kept },
        };
      },
      schema,
      version: 2,
    },
    {
      lifecycle,
      clock,
      fs,
      log: log.scoped("snapshot"),
    }
  );
  return { lifecycle, clock, log, fs, store };
};

const file = (data: unknown, version = 2) => JSON.stringify({ data, version });

describe(SnapshotStore, () => {
  it("reads a current file", async () => {
    const { store } = setup({ [NAME]: file({ names: ["Ada", "Grace"] }) });
    await expect(store.open()).resolves.toStrictEqual({
      fallbacks: [],
      migratedFrom: null,
      source: "file",
      value: { names: ["Ada", "Grace"] },
    });
  });

  it("starts from the recovered value when there is no file", async () => {
    const { store } = setup();
    await expect(store.open()).resolves.toStrictEqual({
      fallbacks: [],
      migratedFrom: null,
      source: "missing",
      value: EMPTY,
    });
  });

  it.each(["{ not json", JSON.stringify({ names: [] }), "[]"])(
    "yields defaults for the corrupt file %s, reports it and keeps a copy",
    async (text) => {
      const { store, fs } = setup({ [NAME]: text });
      await expect(store.open()).resolves.toStrictEqual({
        fallbacks: [],
        migratedFrom: null,
        source: "corrupt",
        value: EMPTY,
      });
      expect(fs.files.get(`${NAME}.corrupt`)).toBe(text);
    }
  );

  it("keeps what parses of a file the schema refuses, and says what fell back", async () => {
    const { store } = setup({ [NAME]: file({ names: ["Ada", 3] }) });
    await expect(store.open()).resolves.toMatchObject({
      fallbacks: ["names"],
      source: "file",
      value: { names: ["Ada"] },
    });
  });

  it("migrates a version 1 file to the current version", async () => {
    const { store } = setup({ [NAME]: JSON.stringify(version1) });
    await expect(store.open()).resolves.toStrictEqual({
      fallbacks: [],
      migratedFrom: 1,
      source: "file",
      value: { names: ["Ada"] },
    });
  });

  it("refuses a file from a newer version, or one a migration cannot read", async () => {
    const newer = setup({ [NAME]: file({ names: ["Ada"] }, 3) });
    await expect(newer.store.open()).resolves.toMatchObject({
      source: "newer",
      value: EMPTY,
    });
    const broken = setup({ [NAME]: file({ title: "Ada" }, 1) });
    await expect(broken.store.open()).resolves.toMatchObject({
      source: "failedMigration",
      value: EMPTY,
    });
  });

  it("never throws when the file cannot be read", async () => {
    const { store, fs, log } = setup();
    const failure = new Error("EACCES");
    fs.failReads = failure;
    await expect(store.open()).resolves.toMatchObject({
      source: "unreadable",
      value: EMPTY,
    });
    expect(log.entries).toStrictEqual([
      {
        fields: { error: failure, file: NAME },
        level: "error",
        message: "Could not read a snapshot file",
        scope: "snapshot",
      },
    ]);
  });

  it("lands a burst of writes once, after the delay", async () => {
    const { store, clock, fs } = setup();
    await store.open();
    store.write({ names: ["Ada"] });
    store.write({ names: ["Ada", "Grace"] });
    clock.advance(50);
    store.write({ names: ["Ada", "Grace", "Hedy"] });
    expect(fs.writes).toStrictEqual([]);
    clock.advance(50);
    await store.flush();
    expect(fs.writes).toStrictEqual([
      {
        name: NAME,
        text: `${JSON.stringify({ data: { names: ["Ada", "Grace", "Hedy"] }, version: 2 }, null, 2)}\n`,
      },
    ]);
    expect(clock.pending).toBe(0);
  });

  it("flushes a pending write when the app quits", async () => {
    const { store, lifecycle, fs, clock } = setup();
    await store.open();
    store.write({ names: ["Ada"] });
    await lifecycle.quitAndWait();
    expect(fs.writes).toHaveLength(1);
    expect(clock.pending).toBe(0);
    const reopened = setup({ [NAME]: fs.writes[0]?.text ?? "" });
    await expect(reopened.store.open()).resolves.toMatchObject({
      value: { names: ["Ada"] },
    });
  });

  it("reloads a file changed by someone else", async () => {
    const { store, fs } = setup({ [NAME]: file({ names: ["Ada"] }) });
    await store.open();
    fs.files.set(NAME, file({ names: ["Hedy"] }));
    await expect(store.reload()).resolves.toMatchObject({
      value: { names: ["Hedy"] },
    });
    fs.files.set(NAME, "{ half");
    await expect(store.reload()).resolves.toBeUndefined();
    expect(fs.files.has(`${NAME}.corrupt`)).toBeFalsy();
  });

  it("ignores its own writes and a change it is about to replace", async () => {
    const { store, fs } = setup({ [NAME]: file({ names: ["Ada"] }) });
    await store.open();
    await expect(store.reload()).resolves.toBeUndefined();
    store.write({ names: ["Grace"] });
    fs.files.set(NAME, file({ names: ["Hedy"] }));
    await expect(store.reload()).resolves.toBeUndefined();
    await store.flush();
    await expect(store.reload()).resolves.toBeUndefined();
  });

  it("refuses a version its migrations do not reach", () => {
    expect(
      () =>
        new SnapshotStore(
          {
            migrations: [],
            name: NAME,
            recover: () => ({ fallbacks: [], value: EMPTY }),
            schema,
            version: 2,
          },
          {
            lifecycle: new FakeLifecycle(),
            clock: new FakeClock(),
            fs: new FakeFs(),
            log: strictLog,
          }
        )
    ).toThrow("people.json is at version 2 with 0 migrations");
  });
});
