import { TITLEBAR_HEIGHT } from "../app/core/engines/chrome.ts";
import { STYLE_METRICS } from "../app/core/engines/layout.ts";
import { SIDEBAR_PIXELS } from "../app/core/engines/sidebar.ts";
import { runCommand, writeSettings } from "../scripts/lib/app.ts";
import type { Launched } from "../scripts/lib/app.ts";
import {
  expect,
  inspect,
  must,
  pickApp,
  styleOf,
  test,
  viewsOf,
  zoomOf,
} from "./app.ts";

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

test("tiles classic panes edge to edge from settings.json", async ({
  launch,
}) => {
  const launched = await launch({
    settings: { global: { "appearance.style": "classic" }, profiles: {} },
  });
  const { app, chrome } = launched;
  await expect.poll(async () => await styleOf(chrome)).toBe("classic");
  // Read with the views each time: on Linux the content area can shrink by the menu bar's height after the page has loaded.
  await expect(async () => {
    const [views, size] = await Promise.all([
      viewsOf(app),
      stageSize(launched),
    ]);
    expect(views).toStrictEqual([{ ...size, ...TOP }]);
  }).toPass({ timeout: 5000 });

  // The split's Calendar tab shows the sidebar, narrow because no app has two tabs.
  await runCommand(chrome, "stage.splitVertical");
  await pickApp(app, "Calendar");
  const sidebar = SIDEBAR_PIXELS.narrow;
  const seam = STYLE_METRICS.classic.gap;
  await expect(async () => {
    const [[shownLeft, shownRight, ...rest], size] = await Promise.all([
      viewsOf(app),
      stageSize(launched),
    ]);
    expect(rest).toHaveLength(0);
    const left = must(shownLeft, "The left pane");
    const right = must(shownRight, "The right pane");
    expect(left).toMatchObject({ height: size.height, x: sidebar, y: TOP.y });
    expect(right).toMatchObject({ height: size.height, y: TOP.y });
    expect(left.width + seam + right.width).toBe(size.width - sidebar);
    expect(right.x).toBe(sidebar + left.width + seam);
  }).toPass({ timeout: 5000 });
});

test("zooms a profile's panes by its override of stage.zoom", async ({
  launch,
}) => {
  const { app } = await launch({
    profileId: PROFILE,
    settings: { global: {}, profiles: { [PROFILE]: { "stage.zoom": 1.5 } } },
  });
  await expect.poll(async () => await zoomOf(app)).toStrictEqual([1.5]);
});

test("puts a rebound command's shortcut in the menu", async ({ launch }) => {
  const { app } = await launch({
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
  const { menu } = await inspect(app);
  expect(menu).toMatchObject({
    "stage.closeTab": null,
    "stage.splitHorizontal": "CommandOrControl+Alt+Shift+N",
    "stage.splitVertical": "CommandOrControl+Alt+V",
  });
});

test("follows settings.json edited while the app runs", async ({
  launch,
  userData,
}) => {
  const launched = await launch({ profileId: PROFILE });
  const { app, chrome } = launched;
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
      panes: [{ zoom: 2 }],
      views: [{ ...size, ...TOP }],
    });
});
