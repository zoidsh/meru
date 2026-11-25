import { describe, expect, it } from "vitest";

import { canHideDock, dockShown } from "./dock.ts";

describe(dockShown, () => {
  it("shows the icon as set while the menu bar icon shows, and always while it does not", () => {
    expect([
      dockShown({ dockIcon: true, tray: true }),
      dockShown({ dockIcon: false, tray: true }),
      dockShown({ dockIcon: true, tray: false }),
      dockShown({ dockIcon: false, tray: false }),
    ]).toStrictEqual([true, false, true, true]);
  });
});

describe(canHideDock, () => {
  it("lets the icon be turned off only while the menu bar icon shows", () => {
    expect([
      canHideDock({ tray: true }),
      canHideDock({ tray: false }),
    ]).toStrictEqual([true, false]);
  });
});
