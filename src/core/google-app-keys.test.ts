import { describe, expect, it } from "vitest";

import { BUILT_IN_SHORTCUTS } from "./built-in-shortcuts.ts";
import { googleAppsUsing } from "./google-app-keys.ts";

const PLATFORMS = ["darwin", "win32", "linux"] as const;

describe(googleAppsUsing, () => {
  it("names the apps that use a key on its platform alone, however the accelerator is written", () => {
    expect([
      googleAppsUsing("CommandOrControl+R", "darwin"),
      googleAppsUsing("CmdOrCtrl+R", "linux"),
      googleAppsUsing("Alt+1", "linux"),
      googleAppsUsing("Alt+1", "darwin"),
      googleAppsUsing("Control+Shift+R", "darwin"),
    ]).toStrictEqual([["Sheets"], ["Sheets"], ["Sheets", "Chat"], [], []]);
  });

  it("finds a Google app's key among the built-in ones only where Meru keeps it for the same action, zoom and full screen, or as Minimize on Windows and Linux", () => {
    const taken = PLATFORMS.flatMap((platform) =>
      BUILT_IN_SHORTCUTS.flatMap(({ id, shortcut }) => {
        const accelerator = shortcut[platform];

        return accelerator !== undefined &&
          googleAppsUsing(accelerator, platform).length > 0
          ? [`${platform} ${id}`]
          : [];
      })
    );

    expect(taken).toStrictEqual([
      "darwin resetZoom",
      "darwin zoomIn",
      "darwin zoomOut",
      "darwin fullScreen",
      "win32 resetZoom",
      "win32 zoomIn",
      "win32 zoomOut",
      "win32 fullScreen",
      "win32 minimize",
      "linux resetZoom",
      "linux zoomIn",
      "linux zoomOut",
      "linux fullScreen",
      "linux minimize",
    ]);
  });
});
