import { describe, expect, it } from "vitest";

import { renameGlobalKeys } from "./migrations.ts";

describe(renameGlobalKeys, () => {
  it("moves the badge and tray keys to their new names, the menu bar's value winning, and leaves the rest", () => {
    expect([
      renameGlobalKeys({
        global: {
          "inbox.dockBadge": false,
          "stage.zoom": 1.5,
          "tray.enabled": false,
          "tray.menuBar": true,
        },
        profiles: { p1: { "stage.zoom": 2 } },
      }),
      renameGlobalKeys({ global: { "tray.enabled": false }, profiles: {} }),
      renameGlobalKeys("not settings"),
    ]).toStrictEqual([
      {
        global: {
          "inbox.unreadBadge": false,
          "stage.zoom": 1.5,
          "tray.icon": true,
        },
        profiles: { p1: { "stage.zoom": 2 } },
      },
      { global: { "tray.icon": false }, profiles: {} },
      "not settings",
    ]);
  });
});
