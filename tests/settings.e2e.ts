import { expect, test } from "@playwright/test";

import { TITLEBAR_HEIGHT } from "../app/core/engines/chrome.ts";
import { SIDEBAR_PIXELS } from "../app/core/engines/sidebar.ts";
import { launch, runCommand, writeSettings } from "../scripts/lib/app.ts";
import type { Launched } from "../scripts/lib/app.ts";
import { inspect, styleOf, viewsOf, zoomOf } from "./app.ts";

const PROFILE = "dev";

/** The content area less the titlebar, which a profile with one tab leaves to its pane. */
const stageSize = async ({ chrome }: Launched) => {
  const { width, height } = await chrome.evaluate<{
    width: number;
    height: number;
  }>("({ width: innerWidth, height: innerHeight })");
  return { height: height - TITLEBAR_HEIGHT, width };
};

const TOP = { x: 0, y: TITLEBAR_HEIGHT };

test("tiles classic panes edge to edge from settings.json", async () => {
  const launched = await launch({
    settings: { global: { "appearance.style": "classic" }, profiles: {} },
  });
  const { app, chrome, close } = launched;
  try {
    await expect.poll(async () => await styleOf(chrome)).toBe("classic");
    // Read with the views each time: on Linux the content area can shrink by the menu bar's height after the page has loaded.
    await expect(async () => {
      const [views, size] = await Promise.all([
        viewsOf(app),
        stageSize(launched),
      ]);
      expect(views).toStrictEqual([{ ...size, ...TOP }]);
    }).toPass({ timeout: 5000 });

    // The split's second Gmail tab shows the sidebar, wide because one app now has two tabs.
    await runCommand(chrome, "stage.splitVertical");
    const sidebar = SIDEBAR_PIXELS.wide;
    await expect(async () => {
      const [[left, right, ...rest], size] = await Promise.all([
        viewsOf(app),
        stageSize(launched),
      ]);
      expect(rest).toHaveLength(0);
      expect(left).toMatchObject({ height: size.height, x: sidebar, y: TOP.y });
      expect(right).toMatchObject({ height: size.height, y: TOP.y });
      expect((left?.width ?? 0) + 1 + (right?.width ?? 0)).toBe(
        size.width - sidebar
      );
      expect(right?.x).toBe(sidebar + (left?.width ?? 0) + 1);
    }).toPass({ timeout: 5000 });
  } finally {
    await close();
  }
});

test("zooms a profile's panes by its override of stage.zoom", async () => {
  const { app, close } = await launch({
    profileId: PROFILE,
    settings: { global: {}, profiles: { [PROFILE]: { "stage.zoom": 1.5 } } },
  });
  try {
    await expect.poll(async () => await zoomOf(app)).toStrictEqual([1.5]);
  } finally {
    await close();
  }
});

test("puts a rebound command's shortcut in the menu", async () => {
  const { app, close } = await launch({
    settings: {
      global: {
        "shortcuts.bindings": {
          "stage.closeTab": null,
          "stage.splitVertical": "Alt+CmdOrCtrl+V",
        },
      },
      profiles: {},
    },
  });
  try {
    const { menu } = await inspect(app);
    expect(menu).toMatchObject({
      "stage.closeTab": null,
      "stage.splitHorizontal": "CommandOrControl+Alt+Shift+N",
      "stage.splitVertical": "CommandOrControl+Alt+V",
    });
  } finally {
    await close();
  }
});

test("follows settings.json edited while the app runs", async () => {
  const launched = await launch({ profileId: PROFILE });
  const { app, chrome, close, userData } = launched;
  try {
    await expect.poll(async () => await styleOf(chrome)).toBe("modern");
    await writeSettings(userData, {
      global: {
        "appearance.style": "classic",
        "shortcuts.bindings": { "stage.splitVertical": "CmdOrCtrl+Alt+V" },
      },
      profiles: { [PROFILE]: { "stage.zoom": 2 } },
    });
    await expect.poll(async () => await styleOf(chrome)).toBe("classic");
    const size = await stageSize(launched);
    await expect
      .poll(async () => await inspect(app))
      .toMatchObject({
        menu: { "stage.splitVertical": "CommandOrControl+Alt+V" },
        views: [{ ...size, ...TOP }],
        zoom: [2],
      });
  } finally {
    await close();
  }
});
