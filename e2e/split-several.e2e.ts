import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readMenuLabel,
  readState,
  readViews,
  sizeWindow,
  test,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { CALENDAR_TITLE, DRIVE_TITLE } from "./lib/stand-in.ts";

interface Tree {
  direction: "row" | "column";
  children: { size: number; pane: string | Tree }[];
}

const row = (...tabIds: string[]): Tree => ({
  direction: "row",
  children: tabIds.map((pane) => ({ size: 1 / tabIds.length, pane })),
});

/**
 * Gmail, which the store pins, Calendar, selected, and three Drive tabs,
 * `o`, `d` and `s`, with `fields` added to the profile. A loaded Drive tab takes its page's
 * title, so the tests find a tab by its id.
 */
const seed = (userDataDir: string, standIn: StandIn, fields: object = {}) =>
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
          { id: "o", app: "drive", url: standIn.driveUrl, title: "Drive o" },
          { id: "d", app: "drive", url: standIn.driveUrl, title: DRIVE_TITLE },
          { id: "s", app: "drive", url: standIn.driveUrl, title: "Drive s" },
        ],
        selectedTabId: "c",
        ...fields,
      },
    ],
    selectedProfileId: "p",
  });

interface Stored {
  selectedTabId: string;
  split?: unknown;
  splits?: { root: Tree; maximized?: boolean }[];
}

const stored = async (userDataDir: string) => {
  const { profiles } = await readState<{ profiles: Stored[] }>(userDataDir);

  return profiles[0];
};

const leaves = (tree: string | Tree): string[] =>
  typeof tree === "string"
    ? [tree]
    : tree.children.flatMap((child) => leaves(child.pane));

/** Each stored split's panes in reading order. */
const storedPanes = async (userDataDir: string) => {
  const profile = await stored(userDataDir);

  return profile?.splits?.map(({ root }) => leaves(root));
};

/** Each stored split's outer shares in thousandths, and whether it is maximized. */
const storedSizes = async (userDataDir: string) => {
  const profile = await stored(userDataDir);

  return profile?.splits?.map(({ root, maximized }) => ({
    shares: root.children.map(({ size }) => Math.round(size * 1000)),
    maximized: maximized ?? false,
  }));
};

/** Each shown view's page, left to right and top to bottom. */
const shownUrls = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views
    .filter((view) => view.visible)
    .toSorted((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
    .map(({ url }) => url);
};

/** Each split's box in the sidebar, its tabs top to bottom. */
const drawnBoxes = (shell: Page) =>
  shell.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-split-box]")].map((box) =>
      [...box.querySelectorAll<HTMLElement>("[data-tab-id]")].map(
        (each) => each.dataset.tabId
      )
    )
  );

const pointOf = async (shell: Page, tabId: string) => {
  const selector = `[data-tab-id="${tabId}"]`;

  // The shell can draw the sidebar after the pages have loaded.
  await expect
    .poll(() =>
      shell.evaluate(
        (each) =>
          (document.querySelector(each)?.getBoundingClientRect().width ?? 0) >
          0,
        selector
      )
    )
    .toBe(true);

  return shell.evaluate((each) => {
    const box = document.querySelector(each)?.getBoundingClientRect();

    return {
      x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
    };
  }, selector);
};

const select = async (shell: Page, tabId: string) => {
  const { x, y } = await pointOf(shell, tabId);

  await shell.mouse.click(x, y);
};

const selected = (shell: Page) =>
  shell.evaluate(
    () =>
      document.querySelector<HTMLElement>('[data-tab-id][aria-selected="true"]')
        ?.dataset.tabId
  );

/** What shows where the drag would land: a line, a ring, or nothing. */
const markShown = (shell: Page) =>
  shell.evaluate(
    () =>
      document.querySelector<HTMLElement>("[data-drag-mark]")?.dataset
        .dragMark ?? "none"
  );

/** Drags the tab `tabId` onto the middle of `onto`, once it shows a ring there. */
const dropOnto = async (shell: Page, tabId: string, onto: string) => {
  const from = await pointOf(shell, tabId);
  const to = await pointOf(shell, onto);

  await shell.mouse.move(from.x, from.y);
  await shell.mouse.down();
  await shell.mouse.move(to.x, to.y, { steps: 8 });
  await expect.poll(() => markShown(shell)).toBe("ring");
  await shell.mouse.up();
};

/**
 * Waits for `urls` to show, then sees `tabId` stay selected for half a
 * second: a pane's page loading for the first time, which on Linux takes
 * keyboard focus, does not select its tab.
 */
const keepsSelected = async (
  app: ElectronApplication,
  shell: Page,
  tabId: string,
  urls: string[]
) => {
  await expect.poll(() => shownUrls(app)).toStrictEqual(urls);

  for (let check = 0; check < 5; check += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one check after another
    expect(await selected(shell)).toBe(tabId);
    // oxlint-disable-next-line no-await-in-loop -- spaced out over half a second
    await delay(100);
  }
};

/** Splits the focused pane that way with the app picked from Open in split. */
const splitFromMenu = async (
  app: ElectronApplication,
  direction: "right" | "down",
  appName: string
) => {
  const overlay = await findOverlayDocument(app);
  const dialog = overlay.getByRole("dialog", { name: "Open in split" });

  await clickMenuItem(
    app,
    direction === "right" ? "tab.splitRight" : "tab.splitDown"
  );
  await expect(dialog).toBeVisible();
  await dialog.getByRole("option", { name: appName, exact: true }).click();
  await expect(dialog).toHaveCount(0);
};

/** Drags the shown split's one gap `dx` pixels across. */
const dragGap = async (shell: Page, dx: number) => {
  const gap = await shell
    .getByRole("separator", { name: "Resize panes" })
    .boundingBox();
  const x = (gap?.x ?? 0) + (gap?.width ?? 0) / 2;
  const y = (gap?.y ?? 0) + (gap?.height ?? 0) / 2;

  await shell.mouse.move(x, y);
  await shell.mouse.down();
  await shell.mouse.move(x + dx, y, { steps: 5 });
  await shell.mouse.up();
};

/** The second split's panes, the one Split right started beside `o`. */
const secondPanes = async (userDataDir: string) => {
  const panes = await storedPanes(userDataDir);

  return panes?.[1] ?? [];
};

/** The first share of the third split, whose gap moved. */
const thirdShare = async (userDataDir: string) => {
  const sizes = await storedSizes(userDataDir);

  return sizes?.[2]?.shares[0] ?? 0;
};

test("a second split starts from Split right beside a tab in none and from a drop onto one; selecting a tab of either shows its split, each with its own sizes and Maximize; a relaunch restores both", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const first = await launchApp();
  const shell = await findPage(first, "meru-app:");

  await findPage(first, standIn.calendarUrl);
  await sizeWindow(first, 1000, 700);
  await splitFromMenu(first, "right", "Gmail");
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual([["c", "gmail"]]);

  await select(shell, "o");
  await expect.poll(() => shownUrls(first)).toStrictEqual([standIn.driveUrl]);
  await splitFromMenu(first, "right", "Drive");

  // A Drive tab opened beside `o`, which is the second split's.
  await expect
    .poll(() => storedPanes(userDataDir).then((panes) => panes?.length))
    .toBe(2);

  const [beside, opened = ""] = await secondPanes(userDataDir);

  expect(beside).toBe("o");
  await expect
    .poll(() => shownUrls(first))
    .toStrictEqual([standIn.driveUrl, standIn.driveUrl]);

  // A third, from a drop of `s` onto `d`, which is in none.
  await dropOnto(shell, "s", "d");
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual([
      ["c", "gmail"],
      ["o", opened],
      ["d", "s"],
    ]);
  await expect.poll(() => selected(shell)).toBe("s");
  await expect
    .poll(() => drawnBoxes(shell).then((boxes) => boxes.length))
    .toBe(3);

  // The third split's gap moved, and the second maximized.
  await dragGap(shell, -100);
  await expect.poll(() => thirdShare(userDataDir)).toBeLessThan(500);

  const moved = await thirdShare(userDataDir);
  await select(shell, "o");
  await expect.poll(() => selected(shell)).toBe("o");
  await clickMenuItem(first, "tab.maximize");
  await expect.poll(() => shownUrls(first)).toStrictEqual([standIn.driveUrl]);

  const sizes = [
    { shares: [500, 500], maximized: false },
    { shares: [500, 500], maximized: true },
    { shares: [moved, 1000 - moved], maximized: false },
  ];

  await expect.poll(() => storedSizes(userDataDir)).toStrictEqual(sizes);

  // Each split shows as it was left.
  await select(shell, "c");
  await expect
    .poll(() => shownUrls(first))
    .toStrictEqual([standIn.calendarUrl, standIn.url]);
  expect(await readMenuLabel(first, "tab.maximize")).toBe("Maximize Pane");
  await select(shell, opened);
  await expect.poll(() => shownUrls(first)).toStrictEqual([standIn.driveUrl]);
  await expect
    .poll(() => readMenuLabel(first, "tab.maximize"))
    .toBe("Restore Panes");
  await select(shell, "d");
  await expect
    .poll(() => shownUrls(first))
    .toStrictEqual([standIn.driveUrl, standIn.driveUrl]);
  expect(await readMenuLabel(first, "tab.maximize")).toBe("Maximize Pane");
  expect(await storedSizes(userDataDir)).toStrictEqual(sizes);

  // Closed only once the selection is stored, which a relaunch reads.
  await expect
    .poll(() => stored(userDataDir).then((profile) => profile?.selectedTabId))
    .toBe("d");

  const before = await stored(userDataDir);

  await first.close();

  const app = await launchApp();
  const again = await findPage(app, "meru-app:");

  await findPage(app, standIn.driveUrl);
  await expect
    .poll(() => shownUrls(app))
    .toStrictEqual([standIn.driveUrl, standIn.driveUrl]);
  await expect
    .poll(() => drawnBoxes(again).then((boxes) => boxes.length))
    .toBe(3);
  await select(again, "o");
  await expect.poll(() => shownUrls(app)).toStrictEqual([standIn.driveUrl]);
  await expect
    .poll(() =>
      again.evaluate(
        () =>
          document.querySelectorAll("[data-split-box][data-maximized]").length
      )
    )
    .toBe(1);
  await select(again, "gmail");
  await expect
    .poll(() => shownUrls(app))
    .toStrictEqual([standIn.calendarUrl, standIn.url]);
  const after = await stored(userDataDir);

  expect(after?.splits).toStrictEqual(before?.splits);
});

test("a tab dragged from one box onto a tab of another joins that split, the first ending at one pane; Open in split moves a tab of another split here", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  // Calendar over Gmail, so a pane beside Calendar keeps the minimum width.
  await seed(userDataDir, standIn, {
    splits: [
      { root: { ...row("c", "gmail"), direction: "column" } },
      { root: row("o", "s") },
    ],
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.calendarUrl);
  await sizeWindow(app, 1000, 700);
  await expect
    .poll(() => drawnBoxes(shell))
    .toStrictEqual([
      ["gmail", "c"],
      ["o", "s"],
    ]);

  await dropOnto(shell, "o", "c");
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual([["c", "o", "gmail"]]);
  await expect.poll(() => selected(shell)).toBe("o");
  await expect
    .poll(() => drawnBoxes(shell))
    .toStrictEqual([["gmail", "c", "o"]]);
  await expect
    .poll(() => shownUrls(app))
    .toStrictEqual([standIn.calendarUrl, standIn.driveUrl, standIn.url]);

  // Gmail's tab is the first split's; Open in split brings it to `s`'s.
  await dropOnto(shell, "d", "s");
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual([
      ["c", "o", "gmail"],
      ["s", "d"],
    ]);
  await expect.poll(() => selected(shell)).toBe("d");
  await keepsSelected(app, shell, "d", [standIn.driveUrl, standIn.driveUrl]);
  await splitFromMenu(app, "down", "Gmail");
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual([
      ["c", "o"],
      ["s", "d", "gmail"],
    ]);
  await expect.poll(() => selected(shell)).toBe("gmail");
  await expect
    .poll(() => shownUrls(app))
    .toStrictEqual([standIn.driveUrl, standIn.driveUrl, standIn.url]);
});

test("a store from a build with one split, under `split`, loads it and is written back as a list of one", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, { split: { root: row("c", "gmail") } });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.url);
  await expect
    .poll(() => shownUrls(app))
    .toStrictEqual([standIn.calendarUrl, standIn.url]);
  await expect.poll(() => drawnBoxes(shell)).toStrictEqual([["gmail", "c"]]);

  // A change has the store written.
  await select(shell, "o");
  await expect
    .poll(() => stored(userDataDir))
    .toMatchObject({
      selectedTabId: "o",
      splits: [{ root: row("c", "gmail") }],
    });
  expect(await stored(userDataDir)).not.toHaveProperty("split");
});
