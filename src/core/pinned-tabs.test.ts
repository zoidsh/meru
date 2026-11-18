import { describe, expect, it } from "vitest";

import {
  pinnedRows,
  pinnedShortcut,
  selectPinnedCommandId,
  splitPinned,
} from "./pinned-tabs.ts";

describe(splitPinned, () => {
  it("puts the pinned tabs in the pinned area and the rest in the list, each in its order", () => {
    const tabs = [
      { id: "a", pinned: false },
      { id: "b", pinned: true },
      { id: "c", pinned: false },
      { id: "d", pinned: true },
    ];
    const { pinned, listed } = splitPinned(tabs);

    expect([
      pinned.map((tab) => tab.id),
      listed.map((tab) => tab.id),
    ]).toStrictEqual([
      ["b", "d"],
      ["a", "c"],
    ]);
  });
});

describe(pinnedRows, () => {
  it("puts the tiles two to a row, the last of an odd count alone", () => {
    expect(
      [1, 2, 3, 4].map((count) =>
        pinnedRows(Array.from({ length: count }, (_, index) => index + 1))
      )
    ).toStrictEqual([
      [[1]],
      [[1, 2]],
      [[1, 2], [3]],
      [
        [1, 2],
        [3, 4],
      ],
    ]);
  });
});

describe(pinnedShortcut, () => {
  it("is Control and Shift with the position, as v3's, with an id per position", () => {
    expect([pinnedShortcut(1), selectPinnedCommandId(9)]).toStrictEqual([
      "Control+Shift+1",
      "tab.pinned.9",
    ]);
  });
});
