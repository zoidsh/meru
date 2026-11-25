import { describe, expect, it } from "vitest";

import { launchWindow } from "./launch-window.ts";

describe(launchWindow, () => {
  it("shows the window unless Open in the background is on, whatever the platform and tray", () => {
    expect(
      (["darwin", "win32", "linux"] as const).flatMap((platform) =>
        [true, false].map((trayShown) =>
          launchWindow({ openInBackground: false, platform, trayShown })
        )
      )
    ).toStrictEqual(Array.from({ length: 6 }, () => "shown"));
  });

  it("hides it in the background where the Dock, the menu bar or the tray brings it back, and minimizes it where nothing would", () => {
    expect([
      launchWindow({
        openInBackground: true,
        platform: "darwin",
        trayShown: false,
      }),
      launchWindow({
        openInBackground: true,
        platform: "darwin",
        trayShown: true,
      }),
      launchWindow({
        openInBackground: true,
        platform: "win32",
        trayShown: true,
      }),
      launchWindow({
        openInBackground: true,
        platform: "linux",
        trayShown: true,
      }),
      launchWindow({
        openInBackground: true,
        platform: "win32",
        trayShown: false,
      }),
      launchWindow({
        openInBackground: true,
        platform: "linux",
        trayShown: false,
      }),
    ]).toStrictEqual([
      "hidden",
      "hidden",
      "hidden",
      "hidden",
      "minimized",
      "minimized",
    ]);
  });
});
