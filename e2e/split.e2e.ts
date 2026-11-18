import type { ElectronApplication, Page } from "@playwright/test";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readState,
  readViews,
  test,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import {
  CALENDAR_TITLE,
  DRIVE_TITLE,
  NEXT_WEEK_PATH,
  STAND_IN_TITLE,
} from "./lib/stand-in.ts";

/** Gmail, pinned, and Calendar, selected, with Drive after it when asked. */
const seed = (userDataDir: string, standIn: StandIn, withDrive = false) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          {
            id: "c",
            app: "calendar",
            url: standIn.calendarUrl,
            title: CALENDAR_TITLE,
          },
          ...(withDrive
            ? [
                {
                  id: "d",
                  app: "drive",
                  url: standIn.driveUrl,
                  title: DRIVE_TITLE,
                },
              ]
            : []),
        ],
        selectedTabId: "c",
      },
    ],
    selectedProfileId: "p",
  });

const tab = (shell: Page, title: string) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab", {
    name: title,
    exact: true,
  });

/** Splits the focused pane that way with the app picked from Open in split. */
const split = async (
  app: ElectronApplication,
  direction: "right" | "down",
  appName: string
) => {
  // Once the shell has opened the overlay's document, which it draws in.
  const overlay = await findOverlayDocument(app);
  const dialog = overlay.getByRole("dialog", { name: "Open in split" });

  await clickMenuItem(
    app,
    direction === "right" ? "tab.splitRight" : "tab.splitDown"
  );

  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      direction === "right"
        ? "Beside the focused pane"
        : "Below the focused pane",
      { exact: true }
    )
  ).toBeVisible();
  await dialog.getByRole("option", { name: appName, exact: true }).click();
  await expect(dialog).toHaveCount(0);
};

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ShownPane {
  url: string;
  bounds: Box;
}

/** A pane's rectangle, a pixel around its view on every side. */
const around = ({ x, y, width, height }: Box): Box => ({
  x: x - 1,
  y: y - 1,
  width: width + 2,
  height: height + 2,
});

/** Each shown view's page, by origin and path, and where it sits. */
const shownPanes = async (app: ElectronApplication): Promise<ShownPane[]> => {
  const { views } = await readViews(app);

  return views
    .filter((view) => view.visible)
    .map(({ url, bounds }) => ({ url, bounds }))
    .toSorted((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
};

/**
 * The panes the shell draws, in the page area's coordinates turned into the
 * window's, and which one carries the focus ring.
 */
const drawnPanes = (shell: Page) =>
  shell.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-pane]")].map((pane) => {
      const { x, y, width, height } = pane.getBoundingClientRect();

      return {
        tabId: pane.dataset.pane,
        focused: pane.dataset.focused !== undefined,
        bounds: { x, y, width, height },
      };
    })
  );

const selectedTitle = (shell: Page) =>
  shell
    .getByRole("tablist", { name: "Tabs" })
    .getByRole("tab", { selected: true })
    .textContent();

/** Gives the page at `url` keyboard focus, as a click in it would. */
const focusPage = (app: ElectronApplication, url: string) =>
  app.evaluate(({ webContents }, prefix) => {
    webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith(prefix))
      ?.focus();
  }, url);

const urlOf = (app: ElectronApplication, prefix: string) =>
  app.evaluate(
    ({ webContents }, start) =>
      webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(start))
        ?.getURL(),
    prefix
  );

interface SavedProfile {
  selectedTabId: string;
  split?: { root: unknown };
}

const savedSplit = async (userDataDir: string) => {
  const { profiles } = await readState<{ profiles: SavedProfile[] }>(
    userDataDir
  );

  return profiles[0]?.split;
};

test("Split right picks an app from Open in split and shows it beside the page, ringed as focused; Split down nests; focus in a pane selects its tab, and Back and Reload act on that pane alone", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const calendar = await findPage(app, standIn.calendarUrl);

  await split(app, "right", "Drive");

  const drive = await findPage(app, standIn.driveUrl);

  await expect
    .poll(() => shownPanes(app).then((panes) => panes.length))
    .toBe(2);

  const [left, right] = (await shownPanes(app)) as [ShownPane, ShownPane];

  expect([left.url, right.url]).toStrictEqual([
    standIn.calendarUrl,
    standIn.driveUrl,
  ]);
  expect([right.bounds.y, right.bounds.height]).toStrictEqual([
    left.bounds.y,
    left.bounds.height,
  ]);
  // 8px between the panes, and each view a pixel inside its pane.
  expect(right.bounds.x - (left.bounds.x + left.bounds.width)).toBe(8 + 2);
  await expect(tab(shell, DRIVE_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );

  const driveId = await tab(shell, DRIVE_TITLE).getAttribute("data-tab-id");

  await expect
    .poll(() => drawnPanes(shell))
    .toStrictEqual([
      { tabId: "c", focused: false, bounds: around(left.bounds) },
      { tabId: driveId, focused: true, bounds: around(right.bounds) },
    ]);

  await split(app, "down", "Gmail");
  await findPage(app, standIn.url);
  await expect
    .poll(() => shownPanes(app).then((panes) => panes.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl, standIn.driveUrl, standIn.url]);

  const nested = await shownPanes(app);
  const [whole, top, bottom] = nested.map(({ bounds }) => bounds) as [
    Box,
    Box,
    Box,
  ];

  expect([
    bottom.x - top.x,
    bottom.width - top.width,
    bottom.y - (top.y + top.height),
    whole.height,
  ]).toStrictEqual([0, 0, 8 + 2, top.height + bottom.height + 8 + 2]);
  await expect(tab(shell, STAND_IN_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await focusPage(app, standIn.calendarUrl);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect
    .poll(() =>
      drawnPanes(shell).then((panes) =>
        panes.filter(({ focused }) => focused).map(({ tabId }) => tabId)
      )
    )
    .toStrictEqual(["c"]);

  await calendar.evaluate(() => Reflect.set(window, "kept", true));
  await drive.evaluate(() => Reflect.set(window, "kept", true));
  await clickMenuItem(app, "tab.reload");
  await expect
    .poll(() =>
      calendar
        .evaluate(() => Reflect.get(window, "kept") === true)
        // Asked while the page reloads.
        .catch(() => true)
    )
    .toBe(false);
  expect(await drive.evaluate(() => Reflect.get(window, "kept"))).toBe(true);

  const nextWeek = new URL(NEXT_WEEK_PATH, standIn.calendarUrl).href;

  await calendar.goto(nextWeek);
  await clickMenuItem(app, "tab.back");
  await expect
    .poll(() => urlOf(app, standIn.calendarUrl))
    .toBe(standIn.calendarUrl);
  expect(await urlOf(app, standIn.driveUrl)).toBe(standIn.driveUrl);
  expect(await selectedTitle(shell)).toBe(CALENDAR_TITLE);
});

test("selecting a tab outside the split shows it alone and a tab in it brings the split back; a relaunch restores it; Separate and Close tab end it at one pane", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, true);

  const first = await launchApp();
  const firstShell = await findPage(first, "meru-app:");

  await findPage(first, standIn.calendarUrl);
  await split(first, "right", "Gmail");
  await expect
    .poll(() => shownPanes(first).then((panes) => panes.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl, standIn.url]);

  await tab(firstShell, DRIVE_TITLE).click();
  await findPage(first, standIn.driveUrl);
  await expect
    .poll(() => shownPanes(first).then((panes) => panes.map(({ url }) => url)))
    .toStrictEqual([standIn.driveUrl]);
  await expect.poll(() => drawnPanes(firstShell)).toStrictEqual([]);

  await tab(firstShell, CALENDAR_TITLE).click();
  await expect
    .poll(() => shownPanes(first).then((panes) => panes.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl, standIn.url]);
  await expect
    .poll(() => savedSplit(userDataDir))
    .toStrictEqual({
      root: {
        direction: "row",
        children: [
          { size: 0.5, pane: "c" },
          { size: 0.5, pane: "gmail" },
        ],
      },
    });
  await first.close();

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.url);
  await expect
    .poll(() => shownPanes(app).then((panes) => panes.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl, standIn.url]);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await clickMenuItem(app, "tab.separate");
  await expect
    .poll(() => shownPanes(app).then((panes) => panes.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl]);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect.poll(() => savedSplit(userDataDir)).toBeUndefined();

  await split(app, "down", "Drive");
  await expect
    .poll(() => shownPanes(app).then((panes) => panes.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl, standIn.driveUrl]);
  await clickMenuItem(app, "tab.close");
  // Drive's tab from before stays, outside the split.
  await expect(tab(shell, DRIVE_TITLE)).toHaveCount(1);
  await expect
    .poll(() => shownPanes(app).then((panes) => panes.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl]);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect.poll(() => savedSplit(userDataDir)).toBeUndefined();
});

test("a pane's tab put to sleep shows the sleeping placeholder in its pane, and Wake loads it there again", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.calendarUrl);
  await split(app, "right", "Gmail");
  await findPage(app, standIn.url);
  await tab(shell, STAND_IN_TITLE).click({ button: "right" });

  const overlay = await findOverlayDocument(app);

  await overlay.getByRole("menuitem", { name: "Sleep", exact: true }).click();

  const placeholder = shell.getByRole("region", {
    name: `${STAND_IN_TITLE} is sleeping`,
  });

  await expect(placeholder).toBeVisible();
  await expect
    .poll(() => shownPanes(app).then((panes) => panes.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl]);

  const [pane] = await drawnPanes(shell).then((panes) =>
    panes.filter(({ tabId }) => tabId === "gmail")
  );
  const box = await placeholder.boundingBox();

  expect([box?.x, box?.width]).toStrictEqual([
    pane?.bounds.x,
    pane?.bounds.width,
  ]);

  await placeholder.getByRole("button", { name: "Wake", exact: true }).click();
  await expect(placeholder).toHaveCount(0);
  await expect
    .poll(() => shownPanes(app).then((panes) => panes.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl, standIn.url]);
});

test("a split that would leave a pane under the minimum is refused with a toast, which takes no focus and closes by itself", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  const overlay = await findOverlayDocument(app);

  await findPage(app, standIn.calendarUrl);
  // The window's least size, whose page area is too short for two panes.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(720, 480);
  });
  await expect
    .poll(() => readViews(app).then(({ area }) => area.height))
    .toBe(480);
  await shell.getByRole("tab", { name: CALENDAR_TITLE, exact: true }).focus();
  await clickMenuItem(app, "tab.splitDown");

  const toast = overlay.getByText("Not enough room to split", { exact: true });

  await expect(toast).toBeVisible();
  await expect(overlay.getByRole("dialog")).toHaveCount(0);
  await expect(
    shell.getByRole("tab", { name: CALENDAR_TITLE, exact: true })
  ).toBeFocused();
  await expect(toast).toHaveCount(0, { timeout: 8000 });
  await expect(
    shell.getByRole("tab", { name: CALENDAR_TITLE, exact: true })
  ).toBeFocused();
  expect(await savedSplit(userDataDir)).toBeUndefined();
});
