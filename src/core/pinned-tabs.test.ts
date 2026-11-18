import { describe, expect, it } from "vitest";

import {
  spansPinnedRow,
  pinnedShortcut,
  selectPinnedCommandId,
} from "./pinned-tabs.ts";

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
