import { delay } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { paneTabs } from "#core/pane-tree.ts";
import type { PaneTree, Split } from "#core/pane-tree.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { resizeSplit } from "#core/tabs.ts";

import { createPaneResize } from "./pane-resize.ts";

const even: Split = {
  root: {
    direction: "row",
    children: [
      { size: 0.5, pane: "gmail" },
      { size: 0.5, pane: "c" },
    ],
  },
};

const setup = (split: Split | null = even) => {
  let state: State = {
    version: 1,
    profiles: [
      {
        ...newProfile("p", "Default"),
        tabs: [gmailTab(), { id: "c", app: "calendar", url: "", title: "" }],
        selectedTabId: "c",
        ...(split && { split }),
      },
    ],
    selectedProfileId: "p",
  };
  const previews: (PaneTree | undefined)[] = [];
  const stored: Split[] = [];
  const logged: string[] = [];

  const resizer = createPaneResize({
    state: () => state,
    // Stored a turn later, as a write to the file is.
    resizeSplit: async (profileId, next) => {
      await delay(0);
      state = resizeSplit(state, profileId, next) ?? state;
      stored.push(next);
    },
    areaSize: () => ({ width: 1008, height: 700 }),
    preview: (tree) => {
      previews.push(tree);
    },
    log: (message) => {
      logged.push(message);
    },
  });

  return {
    resizer,
    previews,
    stored,
    logged,
    split: () => state.profiles[0]?.split,
  };
};

const sizes = (tree: PaneTree | undefined) =>
  typeof tree === "object"
    ? tree.children.map((child) => Math.round(child.size * 1000) / 1000)
    : tree;

const move = (by: number, gesture: number, done = false) => ({
  before: "gmail",
  after: "c",
  by,
  gesture,
  done,
});

describe(createPaneResize, () => {
  it("places the panes on each move from the gesture's start and stores only the last", async () => {
    const { resizer, previews, stored, split } = setup();

    await resizer.resize(move(50, 1));
    await resizer.resize(move(100, 1));
    await resizer.resize(move(-1000, 1));

    expect(previews.map(sizes)).toStrictEqual([
      [0.55, 0.45],
      [0.6, 0.4],
      [0.24, 0.76],
    ]);
    expect(stored).toStrictEqual([]);

    await resizer.resize(move(100, 1, true));

    expect([
      stored.length,
      sizes(split()?.root),
      previews.at(-1),
    ]).toStrictEqual([1, [0.6, 0.4], undefined]);
  });

  it("starts a new gesture from the split as stored then, as a key's step does", async () => {
    const { resizer, split } = setup();

    // Sent together, as keys pressed in a row are, before the first is stored.
    await Promise.all([
      resizer.resize(move(100, 1, true)),
      resizer.resize(move(100, 2, true)),
    ]);

    expect(sizes(split()?.root)).toStrictEqual([0.7, 0.3]);
  });

  it("puts the panes back as stored when the drag is cut off, and stores nothing of it", async () => {
    const { resizer, previews, stored, split } = setup();

    await resizer.resize(move(100, 1));
    resizer.cancel();

    expect([previews.map(sizes), stored, split()]).toStrictEqual([
      [[0.6, 0.4], undefined],
      [],
      even,
    ]);
  });

  it("takes Home and End from the split as stored, after a step sent just before", async () => {
    const { resizer, split } = setup();

    await Promise.all([
      resizer.resize(move(100, 1, true)),
      resizer.resize({ ...move(0, 2, true), to: "minimum" }),
    ]);

    expect(sizes(split()?.root)).toStrictEqual([0.24, 0.76]);

    await resizer.resize({ ...move(0, 3, true), to: "maximum" });

    expect(sizes(split()?.root)).toStrictEqual([0.76, 0.24]);
  });

  it("stores nothing for a press that moved nothing, or moved and came back", async () => {
    const { resizer, stored } = setup();

    await resizer.resize(move(0, 1, true));
    await resizer.resize(move(60, 2));
    await resizer.resize(move(0, 2, true));

    expect(stored).toStrictEqual([]);
  });

  it("evens out the split where the two part", async () => {
    const { resizer, split } = setup();

    await resizer.resize(move(100, 1, true));
    await resizer.evenOut({ before: "gmail", after: "c" });

    expect(split()).toStrictEqual(even);
  });

  it("refuses a gap that is not there, or a profile with no split", async () => {
    const withSplit = setup();
    const without = setup(null);

    await withSplit.resizer.resize({
      ...move(100, 1),
      before: "c",
      after: "gmail",
    });
    await without.resizer.resize(move(100, 1, true));
    await without.resizer.evenOut({ before: "gmail", after: "c" });

    expect([
      withSplit.logged.length,
      without.logged.length,
      without.stored,
      paneTabs(withSplit.split()?.root ?? "none"),
    ]).toStrictEqual([1, 2, [], ["gmail", "c"]]);
  });
});
