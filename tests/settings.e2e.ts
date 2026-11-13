import { expect, test } from "@playwright/test";

import {
  launch,
  runCommand,
  stageOf,
  styleOf,
  viewsOf,
  writeSettings,
  zoomOf,
} from "./app.ts";
import type { Launched } from "./app.ts";

// The profile main/index.ts opens until profiles arrive.
const PROFILE = "dev";

const contentSize = async ({ chrome }: Launched) =>
  await chrome.evaluate<{ width: number; height: number }>(
    "({ width: innerWidth, height: innerHeight })"
  );

test("tiles classic panes edge to edge from settings.json", async () => {
  const launched = await launch({
    settings: { global: { "appearance.style": "classic" }, profiles: {} },
  });
  const { chrome, close } = launched;
  try {
    await expect.poll(async () => await styleOf(chrome)).toBe("classic");
    const size = await contentSize(launched);
    await expect
      .poll(async () => await viewsOf(chrome))
      .toStrictEqual([{ ...size, x: 0, y: 0 }]);

    await runCommand(chrome, "stage.splitVertical");
    await expect.poll(async () => await viewsOf(chrome)).toHaveLength(2);
    const [left, right] = await viewsOf(chrome);
    expect(left).toMatchObject({ height: size.height, x: 0, y: 0 });
    expect(right).toMatchObject({ height: size.height, y: 0 });
    expect((left?.width ?? 0) + 1 + (right?.width ?? 0)).toBe(size.width);
    expect(right?.x).toBe((left?.width ?? 0) + 1);
  } finally {
    await close();
  }
});

test("zooms a profile's panes by its override of stage.zoom", async () => {
  const { chrome, close } = await launch({
    settings: { global: {}, profiles: { [PROFILE]: { "stage.zoom": 1.5 } } },
  });
  try {
    await expect.poll(async () => await zoomOf(chrome)).toStrictEqual([1.5]);
  } finally {
    await close();
  }
});

test("puts a rebound command's shortcut in the menu", async () => {
  const { chrome, close } = await launch({
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
    const { menu } = await stageOf(chrome);
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
  const launched = await launch();
  const { chrome, close, userData } = launched;
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
    const size = await contentSize(launched);
    await expect
      .poll(async () => await stageOf(chrome))
      .toMatchObject({
        menu: { "stage.splitVertical": "CommandOrControl+Alt+V" },
        views: [{ ...size, x: 0, y: 0 }],
        zoom: [2],
      });
  } finally {
    await close();
  }
});
