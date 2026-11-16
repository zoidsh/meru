import path from "node:path";

import { describe, expect, it } from "vitest";

import type { TextFile } from "#platform/text-file.ts";

import { StartupError } from "./failures.ts";
import { loadState } from "./state-store.ts";

const DIR = path.join("/data", "Meru Dev");

const STATE_PATH = path.join(DIR, "state.json");

/** A directory of files in memory, holding `state.json` with `contents`. */
const createFakeFile = (contents?: string) => {
  const files = new Map<string, string>();

  if (contents !== undefined) {
    files.set(STATE_PATH, contents);
  }

  const file: TextFile = {
    path: STATE_PATH,
    read: () => Promise.resolve(files.get(STATE_PATH)),
    write: (text) => {
      files.set(STATE_PATH, text);

      return Promise.resolve();
    },
    moveTo: (newPath) => {
      const text = files.get(STATE_PATH);

      if (text === undefined) {
        return Promise.reject(new Error("ENOENT"));
      }

      files.delete(STATE_PATH);
      files.set(newPath, text);

      return Promise.resolve();
    },
  };

  return { file, files };
};

const load = (file: TextFile) => {
  const logs: string[] = [];
  const state = loadState({
    file,
    newId: () => "new-id",
    now: () => 1_763_290_000_000,
    log: (message) => logs.push(message),
  });

  return { state, logs };
};

const initial = {
  version: 1,
  profiles: [{ id: "new-id", name: "Default" }],
  selectedProfileId: "new-id",
};

describe(loadState, () => {
  it("creates and saves the first profile when there is no state", async () => {
    const { file, files } = createFakeFile();

    await expect(load(file).state).resolves.toStrictEqual(initial);
    expect(JSON.parse(files.get(STATE_PATH) ?? "")).toStrictEqual(initial);
  });

  it("reads the saved state and writes nothing", async () => {
    const saved = JSON.stringify({
      version: 1,
      profiles: [{ id: "kept-id", name: "Work" }],
      selectedProfileId: "kept-id",
    });
    const { file, files } = createFakeFile(saved);

    await expect(load(file).state).resolves.toHaveProperty(
      "selectedProfileId",
      "kept-id"
    );
    expect([...files]).toStrictEqual([[STATE_PATH, saved]]);
  });

  it("keeps an unreadable file aside and starts afresh", async () => {
    const { file, files } = createFakeFile("{ not json");
    const { state, logs } = load(file);

    await expect(state).resolves.toStrictEqual(initial);
    expect(files.get(path.join(DIR, "state.corrupt-1763290000000.json"))).toBe(
      "{ not json"
    );
    expect(JSON.parse(files.get(STATE_PATH) ?? "")).toStrictEqual(initial);
    expect(logs).toHaveLength(1);
  });

  it("stops startup on a newer version's file and leaves it alone", async () => {
    const newer = JSON.stringify({ version: 2, profiles: {} });
    const { file, files } = createFakeFile(newer);

    await expect(load(file).state).rejects.toBeInstanceOf(StartupError);
    expect([...files]).toStrictEqual([[STATE_PATH, newer]]);
  });
});
