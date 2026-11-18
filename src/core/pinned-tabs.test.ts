import { describe, expect, it } from "vitest";

import { pinnedShortcut, selectPinnedCommandId } from "./pinned-tabs.ts";

describe(pinnedShortcut, () => {
  it("is Control and Shift with the position, as v3's, with an id per position", () => {
    expect([pinnedShortcut(1), selectPinnedCommandId(9)]).toStrictEqual([
      "Control+Shift+1",
      "tab.pinned.9",
    ]);
  });
});
