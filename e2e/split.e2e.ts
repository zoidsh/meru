import type { ElectronApplication, Locator, Page } from "@playwright/test";

import {
  chooseContextMenuItem,
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  openContextMenu,
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
  splits?: { root: unknown }[];
}

const savedSplit = async (userDataDir: string) => {
  const { profiles } = await readState<{ profiles: SavedProfile[] }>(
    userDataDir
  );

  return profiles[0]?.splits?.[0];
};

const savedSelected = async (userDataDir: string) => {
  const { profiles } = await readState<{ profiles: SavedProfile[] }>(
    userDataDir
  );

  return profiles[0]?.selectedTabId;
};

test("Split right picks an app from Open in split and shows it beside the page, ringed as focused; Split down nests; a click in a pane selects its tab, and Back and Reload act on that pane alone", async ({
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

  await calendar.mouse.click(40, 200);
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
  await expect.poll(() => savedSelected(userDataDir)).toBe("c");
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
  await openContextMenu(app, () =>
    tab(shell, STAND_IN_TITLE).click({ button: "right" })
  );
  await chooseContextMenuItem(app, "Sleep");

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

/**
 * As `overlay.e2e.ts`: whether the page holds Chromium's keyboard focus, with
 * Playwright's emulation, which has every page claim it, off.
 */
const followRealFocus = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });

  return () => page.evaluate(() => document.hasFocus());
};

test("a split that would leave a pane under the minimum is refused with a toast, which takes no focus, leaves the page focus a tab's menu left it, gives back what a card it replaces took, and closes by itself", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);
  const calendar = await findPage(app, standIn.calendarUrl);
  const calendarHasFocus = await followRealFocus(calendar);

  // The app is never active, so the system names no focused web contents;
  // each one's own focus event, which main follows too, says which has it.
  await app.evaluate(({ webContents }) => {
    for (const each of webContents.getAllWebContents()) {
      each.on("focus", () => {
        Reflect.set(globalThis, "lastFocused", each.getURL());
      });
    }
  });

  const where = async () => {
    const url = await app.evaluate(
      () => Reflect.get(globalThis, "lastFocused") as string | undefined
    );

    // Nothing has moved focus since the page took it at launch.
    if (url === undefined || url.startsWith(standIn.calendarUrl)) {
      return (await calendarHasFocus()) ? "calendar" : "calendar, not real";
    }

    return url === "about:blank" ? "overlay" : url.split(":")[0];
  };
  const toast = overlay
    .getByRole("region", { name: "Notifications" })
    .getByText("Not enough room to split", { exact: true });
  const calendarTab = tab(shell, CALENDAR_TITLE);

  // The window's least size, whose page area is too short for two panes.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(720, 480);
  });
  await expect
    .poll(() => readViews(app).then(({ area }) => area.height))
    .toBe(480);
  await expect.poll(where).toBe("calendar");

  // With nothing open, the page keeps its focus throughout.
  await clickMenuItem(app, "tab.splitDown");
  await expect(toast).toBeVisible();
  await expect(overlay.getByRole("dialog")).toHaveCount(0);
  await expect.poll(where).toBe("calendar");
  await expect(toast).toHaveCount(0, { timeout: 8000 });
  expect(await where()).toBe("calendar");

  // From the tab's menu, which takes no focus: the page keeps it.
  await openContextMenu(app, () => calendarTab.click({ button: "right" }));
  await chooseContextMenuItem(app, "Split down");
  await expect(toast).toBeVisible();
  await expect.poll(where).toBe("calendar");
  await expect(toast).toHaveCount(0, { timeout: 8000 });

  // Over the rename card, which had focus: back in the page.
  await clickMenuItem(app, "profile.rename");
  await expect(
    overlay.getByRole("dialog", { name: "Rename profile" })
  ).toBeVisible();
  await expect.poll(where).toBe("overlay");
  await clickMenuItem(app, "tab.splitDown");
  await expect(toast).toBeVisible();
  await expect.poll(where).toBe("calendar");

  expect(await savedSplit(userDataDir)).toBeUndefined();
});

const PINNED_DOCS = "Docs pinned";
const SLIDES = "Slides listed";
const LISTED_SHEETS = "Sheets listed";

/**
 * Gmail and Docs pinned, then Calendar, Sheets and Drive, with `root` as the
 * split and Calendar selected; no app has two tabs, so the sidebar starts
 * narrow.
 */
const seedBox = (userDataDir: string, standIn: StandIn, root: unknown) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          {
            id: "gmail",
            app: "gmail",
            url: standIn.url,
            title: "",
            pinned: true,
          },
          {
            id: "k",
            app: "docs",
            url: standIn.driveUrl,
            title: PINNED_DOCS,
            pinned: true,
          },
          {
            id: "c",
            app: "calendar",
            url: standIn.calendarUrl,
            title: CALENDAR_TITLE,
          },
          {
            id: "o",
            app: "sheets",
            url: standIn.driveUrl,
            title: LISTED_SHEETS,
          },
          { id: "d", app: "drive", url: standIn.driveUrl, title: DRIVE_TITLE },
        ],
        selectedTabId: "c",
        splits: [{ root }],
      },
    ],
    selectedProfileId: "p",
  });

const row = (...tabIds: string[]) => ({
  direction: "row",
  children: tabIds.map((pane) => ({ size: 1 / tabIds.length, pane })),
});

/** The sidebar's tabs in order, and the box's tabs and the area it is in. */
const sidebarOrder = (shell: Page) =>
  shell.evaluate(() => {
    const box = document.querySelector<HTMLElement>("[data-split-box]");
    // oxlint-disable-next-line consistent-function-scoping -- runs in the page, which has only what this function holds
    const ids = (within: Element | null) =>
      [...(within?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])].map(
        (each) => each.dataset.tabId
      );

    return {
      tabs: ids(document.querySelector('[role="tablist"]')),
      box: ids(box),
      area: box?.closest<HTMLElement>("[data-tab-area]")?.dataset.tabArea,
    };
  });

/** A point of the box, `down` of the way from its top. */
const pointOfBox = (shell: Page, down: number) =>
  shell.evaluate((share) => {
    const box = document
      .querySelector("[data-split-box]")
      ?.getBoundingClientRect();

    return {
      x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.y ?? 0) + (box?.height ?? 0) * share,
    };
  }, down);

/** Drags `target` in steps to `to`, as a person does. */
const dragTo = async (
  shell: Page,
  target: Locator,
  to: { x: number; y: number }
) => {
  const from = await middleOf(target);

  await shell.mouse.move(from.x, from.y);
  await shell.mouse.down();
  await shell.mouse.move(to.x, to.y, { steps: 8 });
  await shell.mouse.up();
};

const middleOf = async (target: Locator, down = 0.5) => {
  const box = await target.boundingBox();

  return {
    x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
    y: (box?.y ?? 0) + (box?.height ?? 0) * down,
  };
};

test("a split's tabs sit in one box in the list where its first tab was, in reading order; selecting one shows the split focused on it, one outside shows alone", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seedBox(userDataDir, standIn, row("d", "c"));

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const calendar = tab(shell, CALENDAR_TITLE);
  const order = ["gmail", "k", "d", "c", "o"];

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);
  await expect
    .poll(() => sidebarOrder(shell))
    .toStrictEqual({
      tabs: order,
      box: ["d", "c"],
      area: "listed",
    });
  await expect(calendar).toHaveAccessibleDescription("In split view");

  // Gmail, outside the split; a Sheets tab would load Google's own page,
  // since its stand-in address is not one Sheets claims.
  await tab(shell, "Gmail").click();
  await expect.poll(() => drawnPanes(shell)).toStrictEqual([]);
  expect(await sidebarOrder(shell)).toMatchObject({ box: ["d", "c"] });

  await tab(shell, DRIVE_TITLE).click();
  await expect
    .poll(() =>
      drawnPanes(shell).then((panes) =>
        panes.map(({ tabId, focused }) => ({ tabId, focused }))
      )
    )
    .toStrictEqual([
      { tabId: "d", focused: true },
      { tabId: "c", focused: false },
    ]);

  // Each cross lies on its own tab's corner, below the box as in it.
  const cross = (title: string) =>
    shell.getByRole("button", { name: `Close ${title}`, includeHidden: true });

  for (const title of [LISTED_SHEETS, DRIVE_TITLE]) {
    // oxlint-disable-next-line no-await-in-loop -- one tab at a time
    const tile = await tab(shell, title).boundingBox();
    // oxlint-disable-next-line no-await-in-loop -- one tab at a time
    const corner = await cross(title).boundingBox();

    expect(corner?.y).toBeGreaterThan((tile?.y ?? 0) - 8);
    expect(corner?.y).toBeLessThan(tile?.y ?? 0);
  }

  await tab(shell, DRIVE_TITLE).hover();
  await cross(DRIVE_TITLE).click();
  await expect
    .poll(() => sidebarOrder(shell))
    .toStrictEqual({
      tabs: ["gmail", "k", "c", "o"],
      box: [],
      area: undefined,
    });
});

test("a split holding a pinned tab puts its box first in the pinned area, its pinned tabs first, narrow and wide; separating ends it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seedBox(userDataDir, standIn, row("c", "gmail"));

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const boxed = {
    tabs: ["gmail", "c", "k", "o", "d"],
    box: ["gmail", "c"],
    area: "pinned",
  };

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.url);
  await expect.poll(() => sidebarOrder(shell)).toStrictEqual(boxed);

  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  // A tile's tooltip, which is its description, is said first.
  await expect(tab(shell, STAND_IN_TITLE)).toHaveAccessibleDescription(
    `${STAND_IN_TITLE} · sign in required, in split view`
  );
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAccessibleDescription(
    "In split view"
  );
  expect(await sidebarOrder(shell)).toStrictEqual(boxed);

  // A row with its title in the box, as in the list.
  const calendar = await tab(shell, CALENDAR_TITLE).boundingBox();

  expect(calendar?.width).toBeGreaterThan((calendar?.height ?? 0) * 3);

  await clickMenuItem(app, "tab.separate");
  await expect
    .poll(() => sidebarOrder(shell))
    .toStrictEqual({
      tabs: ["gmail", "k", "c", "o", "d"],
      box: [],
      area: undefined,
    });
});

test("a tab outside moves past a box in the list as past one place, above or below it and never into it, by the keyboard and by a drag", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          {
            id: "gmail",
            app: "gmail",
            url: standIn.url,
            title: "",
            pinned: true,
          },
          { id: "s", app: "slides", url: standIn.driveUrl, title: SLIDES },
          {
            id: "c",
            app: "calendar",
            url: standIn.calendarUrl,
            title: CALENDAR_TITLE,
          },
          {
            id: "o",
            app: "sheets",
            url: standIn.driveUrl,
            title: LISTED_SHEETS,
          },
          { id: "d", app: "drive", url: standIn.driveUrl, title: DRIVE_TITLE },
        ],
        selectedTabId: "c",
        splits: [{ root: row("d", "c") }],
      },
    ],
    selectedProfileId: "p",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const sheets = tab(shell, LISTED_SHEETS);
  const slides = tab(shell, SLIDES);
  const drawn = (...ids: string[]) =>
    expect
      .poll(() => sidebarOrder(shell).then(({ tabs }) => tabs))
      .toStrictEqual(["gmail", ...ids]);

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);
  await drawn("s", "d", "c", "o");

  await sheets.focus();
  await sheets.press("Alt+ArrowUp");
  await drawn("s", "o", "d", "c");
  await expect(sheets).toBeFocused();
  await sheets.press("Alt+ArrowDown");
  await drawn("s", "d", "c", "o");

  await slides.focus();
  await slides.press("Alt+ArrowDown");
  await drawn("d", "c", "s", "o");
  await slides.press("Alt+ArrowUp");
  await drawn("s", "d", "c", "o");

  // The box's top and bottom edges are the gaps above and below it.
  await dragTo(shell, sheets, await pointOfBox(shell, 0.05));
  await drawn("s", "o", "d", "c");
  await dragTo(shell, sheets, await pointOfBox(shell, 0.95));
  await drawn("s", "d", "c", "o");
  await dragTo(shell, slides, await pointOfBox(shell, 0.95));
  await drawn("d", "c", "s", "o");
  await dragTo(shell, slides, await pointOfBox(shell, 0.05));
  await drawn("s", "d", "c", "o");
});

test("Left and Right in the wide pinned grid go between the two tiles of a row, counted after a box first in the pinned area", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const pinnedTab = (id: string, app: string, title: string) => ({
    id,
    app,
    url: standIn.driveUrl,
    title,
    pinned: true,
  });

  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          {
            id: "gmail",
            app: "gmail",
            url: standIn.url,
            title: "",
            pinned: true,
          },
          pinnedTab("k", "docs", PINNED_DOCS),
          pinnedTab("q", "sheets", "Sheets pinned"),
          pinnedTab("r", "slides", "Slides pinned"),
          {
            id: "c",
            app: "calendar",
            url: standIn.calendarUrl,
            title: CALENDAR_TITLE,
          },
        ],
        selectedTabId: "c",
        splits: [{ root: row("c", "gmail") }],
      },
    ],
    selectedProfileId: "p",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const docs = tab(shell, PINNED_DOCS);
  const sheets = tab(shell, "Sheets pinned");
  const slides = tab(shell, "Slides pinned");

  await findPage(app, standIn.calendarUrl);
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await expect
    .poll(() => sidebarOrder(shell))
    .toMatchObject({ area: "pinned", box: ["gmail", "c"] });

  await docs.focus();
  await docs.press("ArrowRight");
  await expect(sheets).toBeFocused();
  await sheets.press("ArrowRight");
  await expect(sheets).toBeFocused();
  await sheets.press("ArrowLeft");
  await expect(docs).toBeFocused();
  await slides.focus();
  await slides.press("ArrowRight");
  await slides.press("ArrowLeft");
  await expect(slides).toBeFocused();
});
