import { describe, expect, it } from "vitest";

import { BUILT_IN_SHORTCUTS } from "./built-in-shortcuts.ts";
import { googleAppsUsing } from "./google-app-keys.ts";

const PLATFORMS = ["darwin", "win32", "linux"] as const;

describe(googleAppsUsing, () => {
  it("names the apps that use a key on its platform alone, however the accelerator is written", () => {
    expect([
      googleAppsUsing("CommandOrControl+R", "darwin"),
      googleAppsUsing("CmdOrCtrl+R", "linux"),
      googleAppsUsing("Shift+Command+V", "darwin"),
      googleAppsUsing("Command+Shift+V", "darwin"),
      googleAppsUsing("Control+Shift+V", "darwin"),
      googleAppsUsing("Control+Shift+R", "darwin"),
    ]).toStrictEqual([
      ["Sheets"],
      ["Sheets"],
      ["Drive", "Docs", "Sheets"],
      ["Drive", "Docs", "Sheets"],
      [],
      [],
    ]);
  });

  it("counts a chord's first key, a range's every key and each platform's column", () => {
    expect([
      // Docs' "holding Ctrl + Alt, press n then h".
      googleAppsUsing("Control+Alt+N", "win32"),
      // Docs' heading styles, Ctrl + Alt + 1 to 6.
      googleAppsUsing("Control+Alt+6", "linux"),
      // Meet's columns differ: Ctrl + ⌘ on a Mac, Ctrl + Alt on a PC.
      googleAppsUsing("Control+Command+M", "darwin"),
      googleAppsUsing("Control+Alt+P", "darwin"),
      googleAppsUsing("Control+Alt+P", "linux"),
    ]).toStrictEqual([
      ["Docs", "Sheets", "Slides"],
      ["Docs"],
      ["Meet"],
      [],
      ["Drive", "Docs", "Sheets", "Slides", "Meet"],
    ]);
  });

  it("hears Plus as `=` pressed with Shift or without, and a shifted symbol as its key with Shift", () => {
    expect([
      googleAppsUsing("Command+=", "darwin"),
      googleAppsUsing("Shift+Command+=", "darwin"),
      googleAppsUsing("Control+Shift+,", "win32"),
      googleAppsUsing("Control+Shift+<", "win32"),
    ]).toStrictEqual([
      ["Docs", "Slides"],
      ["Gmail", "Docs", "Slides"],
      ["Docs", "Slides"],
      ["Docs", "Slides"],
    ]);
  });

  it("finds a Google app's key among the built-in ones only for zoom, full screen and Minimize, which Meru keeps", () => {
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
      "darwin minimize",
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
