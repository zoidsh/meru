import path from "node:path";

import { describe, expect, it } from "vitest";

import { newProfile } from "#core/state.ts";
import type { TextFile } from "#platform/text-file.ts";

import { StartupError } from "./failures.ts";
import { openState, saveState } from "./state-store.ts";

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
  const state = openState({
    file,
    newId: () => "new-id",
    now: () => 1_763_290_000_000,
    log: (message) => logs.push(message),
  }).then(async (opened) => {
    await opened.settle();

    return opened.value;
  });

  return { state, logs };
};

const initial = {
  version: 1,
  profiles: [newProfile("new-id", "Default")],
  selectedProfileId: "new-id",
};

describe(openState, () => {
  it("creates and saves the first profile when there is no state", async () => {
    const { file, files } = createFakeFile();

    await expect(load(file).state).resolves.toStrictEqual(initial);
    expect(JSON.parse(files.get(STATE_PATH) ?? "")).toStrictEqual(initial);
  });

  it("reads a file whose profiles hold no tabs, giving each its Gmail tab, and writes nothing", async () => {
    const saved = JSON.stringify({
      version: 1,
      profiles: [{ id: "kept-id", name: "Work" }],
      selectedProfileId: "kept-id",
    });
    const { file, files } = createFakeFile(saved);

    const state = await load(file).state;

    expect(state.selectedProfileId).toBe("kept-id");
    expect(state.profiles).toStrictEqual([newProfile("kept-id", "Work")]);
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

  it("keeps the list to clear, and keys it does not know at the top and in a profile, when it rewrites the file", async () => {
    const { file, files } = createFakeFile(
      JSON.stringify({
        version: 1,
        profiles: [{ id: "kept-id", name: "Work", color: "teal" }],
        selectedProfileId: "kept-id",
        profilesToClear: ["removed-id"],
        panes: [{ tab: 1 }],
      })
    );
    const state = await load(file).state;

    await saveState(file, { ...state, selectedProfileId: "kept-id" });

    expect(JSON.parse(files.get(STATE_PATH) ?? "")).toStrictEqual({
      version: 1,
      profiles: [{ ...newProfile("kept-id", "Work"), color: "teal" }],
      selectedProfileId: "kept-id",
      profilesToClear: ["removed-id"],
      panes: [{ tab: 1 }],
    });
  });

  it("reads a profile with tabs it cannot read, and writes them back as they were", async () => {
    const tabs = [
      { id: "gmail", app: "gmail", url: "", title: "" },
      { id: "t1", app: "drive", url: null },
    ];
    const saved = {
      version: 1,
      profiles: [
        { id: "a", name: "Work", tabs, selectedTabId: "gmail" },
        { id: "b", name: "Home", tabs: "tabs", selectedTabId: "gmail" },
      ],
      selectedProfileId: "a",
    };
    const { file, files } = createFakeFile(JSON.stringify(saved));
    const state = await load(file).state;

    await saveState(file, state);

    expect(JSON.parse(files.get(STATE_PATH) ?? "")).toStrictEqual(saved);
  });

  it("keeps profiles and tabs it cannot read in their places when it rewrites the file", async () => {
    const saved = {
      version: 1,
      profiles: [
        { id: "x", name: 7 },
        {
          id: "a",
          name: "Work",
          tabs: [
            { id: "gmail", app: "gmail", url: "", title: "" },
            { id: "t1", app: "drive" },
          ],
          selectedTabId: "gmail",
        },
        "broken",
      ],
      selectedProfileId: "x",
    };
    const { file, files } = createFakeFile(JSON.stringify(saved));
    const state = await load(file).state;

    expect(state.selectedProfileId).toBe("a");
    await saveState(file, state);

    expect(JSON.parse(files.get(STATE_PATH) ?? "")).toStrictEqual({
      ...saved,
      selectedProfileId: "a",
    });
  });

  it("adds a first profile when none can be read, keeping those in the file", async () => {
    const saved = {
      version: 1,
      profiles: [{ id: "x" }],
      selectedProfileId: "x",
    };
    const { file, files } = createFakeFile(JSON.stringify(saved));
    const state = await load(file).state;

    expect(state.profiles).toStrictEqual([newProfile("new-id", "Default")]);
    expect(JSON.parse(files.get(STATE_PATH) ?? "")).toStrictEqual({
      ...saved,
      profiles: [{ id: "x" }, newProfile("new-id", "Default")],
      selectedProfileId: "new-id",
    });
  });

  it("still starts on a new first profile, and logs, when saving it fails", async () => {
    const { file } = createFakeFile(
      JSON.stringify({ version: 1, profiles: [], selectedProfileId: "" })
    );
    const failing: TextFile = {
      ...file,
      write: () => Promise.reject(new Error("disk full")),
    };
    const { state, logs } = load(failing);

    await expect(state).resolves.toMatchObject({
      selectedProfileId: "new-id",
    });
    expect(logs).toStrictEqual([
      "The new first profile was not saved: Error: disk full",
    ]);
  });

  it("stops startup on a newer version's file and leaves it alone", async () => {
    const newer = JSON.stringify({ version: 2, profiles: {} });
    const { file, files } = createFakeFile(newer);

    await expect(load(file).state).rejects.toBeInstanceOf(StartupError);
    expect([...files]).toStrictEqual([[STATE_PATH, newer]]);
  });
});
