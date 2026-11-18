import { describe, expect, it } from "vitest";

import {
  spansPinnedRow,
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

describe(spansPinnedRow, () => {
  it("spans the row with the last tile of an odd count alone", () => {
    expect(
      [1, 2, 3, 4].map((count) =>
        Array.from({ length: count }, (_, index) =>
          spansPinnedRow(index, count)
        )
      )
    ).toStrictEqual([
      [true],
      [false, false],
      [false, false, true],
      [false, false, false, false],
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
