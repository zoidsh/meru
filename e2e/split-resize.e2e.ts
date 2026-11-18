import type { ElectronApplication, Page } from "@playwright/test";

import {
  chooseContextMenuItem,
  clickMenuItem,
  expect,
  findPage,
  openContextMenu,
  readMenuLabel,
  readState,
  readViews,
  test,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { CALENDAR_TITLE, DRIVE_TITLE, STAND_IN_TITLE } from "./lib/stand-in.ts";

const MINIMUM = 240;
const STEP = 24;

interface Child {
  size: number;
  pane: string | Tree;
}

interface Tree {
  direction: "row" | "column";
  children: Child[];
}

const row = (...children: [number, string][]): Tree => ({
  direction: "row",
  children: children.map(([size, pane]) => ({ size, pane })),
});

/** Calendar, selected, beside Gmail as `root` has them, and Drive outside. */
const seed = (
  userDataDir: string,
  standIn: StandIn,
  root: Tree,
  maximized = false
) =>
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
          { id: "d", app: "drive", url: standIn.driveUrl, title: DRIVE_TITLE },
        ],
        selectedTabId: "c",
        splits: [{ root, ...(maximized && { maximized }) }],
      },
    ],
    selectedProfileId: "p",
  });

const tab = (shell: Page, title: string) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab", {
    name: title,
    exact: true,
  });

const handle = (shell: Page) =>
  shell.getByRole("separator", { name: "Resize panes" });

/** Each shown view's page and width, left to right. */
const shownWidths = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views
    .filter((view) => view.visible)
    .toSorted((a, b) => a.bounds.x - b.bounds.x)
    .map(({ url, bounds }) => ({ url, width: bounds.width }));
};

/** The panes' widths as the shell draws them, left to right. */
const paneWidths = (shell: Page) =>
  shell.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-pane]")]
      .map((pane) => pane.getBoundingClientRect())
      .toSorted((a, b) => a.x - b.x)
      .map(({ width }) => Math.round(width))
  );

const storedSplit = async (userDataDir: string) => {
  const { profiles } = await readState<{
    profiles: { splits?: { root: Tree; maximized?: unknown }[] }[];
  }>(userDataDir);

  return profiles[0]?.splits?.[0];
};

const storedSelected = async (userDataDir: string) => {
  const { profiles } = await readState<{
    profiles: { selectedTabId: string }[];
  }>(userDataDir);

  return profiles[0]?.selectedTabId;
};

const storedShares = async (userDataDir: string) => {
  const split = await storedSplit(userDataDir);

  return split?.root.children.map(({ size }) => Math.round(size * 1000) / 1000);
};

const middleOf = async (shell: Page) => {
  const box = await handle(shell).boundingBox();

  return {
    x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
    y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
  };
};

/**
 * Presses at `from` and lets go `by` pixels across with no move between, as
 * when Chromium holds the moves for a frame the release comes before.
 */
const releaseUntold = async (
  shell: Page,
  from: { x: number; y: number },
  by: number
) => {
  const cdp = await shell.context().newCDPSession(shell);
  const press = { y: from.y, button: "left", clickCount: 1 } as const;

  await cdp.send("Input.dispatchMouseEvent", {
    ...press,
    type: "mousePressed",
    x: from.x,
    buttons: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    ...press,
    type: "mouseReleased",
    x: from.x + by,
    buttons: 0,
  });
};

/** Gives the page at `url` keyboard focus, as a click in it would. */
const focusPage = (app: ElectronApplication, url: string) =>
  app.evaluate(({ webContents }, prefix) => {
    webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith(prefix))
      ?.focus();
  }, url);

/** Presses Maximize's shortcut in the page at `url`, as the system hands it the key. */
const pressMaximize = (app: ElectronApplication, url: string) =>
  app.evaluate(
    ({ webContents }, { prefix, mac }) => {
      const view = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(prefix));

      for (const type of ["keyDown", "keyUp"] as const) {
        view?.sendInputEvent({
          type,
          keyCode: "Enter",
          modifiers: [mac ? "meta" : "control", "shift"],
        });
      }
    },
    { prefix: url, mac: process.platform === "darwin" }
  );

const boxFill = (shell: Page) =>
  shell.evaluate(() => {
    const box = document.querySelector("[data-split-box]");

    return box ? getComputedStyle(box).backgroundColor : undefined;
  });

test("dragging a gap resizes the pages beside it as it moves and stops at each pane's minimum; a double-click evens them out; a relaunch keeps the sizes", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, row([0.5, "c"], [0.5, "gmail"]));

  const first = await launchApp();
  const shell = await findPage(first, "meru-app:");

  await findPage(first, standIn.url);
  await expect.poll(() => shownWidths(first)).toHaveLength(2);

  const [left, right] = await shownWidths(first);
  const start = await middleOf(shell);

  await expect(handle(shell)).toHaveAttribute("aria-orientation", "vertical");
  await shell.mouse.move(start.x, start.y);
  await shell.mouse.down();
  await shell.mouse.move(start.x + 100, start.y, { steps: 5 });

  // Before the release, both pages have their new widths.
  await expect
    .poll(() => shownWidths(first))
    .toStrictEqual([
      { url: standIn.calendarUrl, width: (left?.width ?? 0) + 100 },
      { url: standIn.url, width: (right?.width ?? 0) - 100 },
    ]);
  await expect.poll(() => storedShares(userDataDir)).toStrictEqual([0.5, 0.5]);

  await shell.mouse.move(start.x + 4000, start.y, { steps: 5 });
  await expect
    .poll(() => paneWidths(shell).then((widths) => widths[1]))
    .toBe(MINIMUM);
  await shell.mouse.up();

  const total = (left?.width ?? 0) + (right?.width ?? 0) + 4;

  await expect
    .poll(() => storedShares(userDataDir))
    .toStrictEqual([
      Math.round(((total - MINIMUM) / total) * 1000) / 1000,
      Math.round((MINIMUM / total) * 1000) / 1000,
    ]);
  await expect(handle(shell)).toHaveAttribute(
    "aria-valuenow",
    String(total - MINIMUM)
  );

  const back = await middleOf(shell);

  await shell.mouse.move(back.x, back.y);
  await shell.mouse.down();
  await shell.mouse.move(back.x - 4000, back.y, { steps: 5 });
  await shell.mouse.up();
  await expect
    .poll(() => paneWidths(shell).then((widths) => widths[0]))
    .toBe(MINIMUM);

  await handle(shell).dblclick();
  await expect.poll(() => storedShares(userDataDir)).toStrictEqual([0.5, 0.5]);
  await expect
    .poll(() => shownWidths(first))
    .toStrictEqual([
      { url: standIn.calendarUrl, width: left?.width },
      { url: standIn.url, width: right?.width },
    ]);

  // A release lands where it is let go, though no move told of it.
  await releaseUntold(shell, await middleOf(shell), -40);

  await expect
    .poll(() => paneWidths(shell))
    .toStrictEqual([(left?.width ?? 0) + 2 - 40, (right?.width ?? 0) + 2 + 40]);
  await handle(shell).dblclick();
  await expect.poll(() => storedShares(userDataDir)).toStrictEqual([0.5, 0.5]);

  const uneven = await middleOf(shell);

  await shell.mouse.move(uneven.x, uneven.y);
  await shell.mouse.down();
  await shell.mouse.move(uneven.x - 80, uneven.y, { steps: 3 });
  await shell.mouse.up();
  await expect
    .poll(() => paneWidths(shell))
    .toStrictEqual([(left?.width ?? 0) + 2 - 80, (right?.width ?? 0) + 2 + 80]);

  const widths = await paneWidths(shell);

  // Closed only once the release is stored, which a relaunch reads.
  await expect
    .poll(() => storedShares(userDataDir).then((shares) => shares?.[0]))
    .toBeLessThan(0.5);
  await first.close();

  const app = await launchApp();
  const again = await findPage(app, "meru-app:");

  await findPage(app, standIn.url);
  await expect.poll(() => paneWidths(again)).toStrictEqual(widths);
});

test("a focused gap moves a step with an arrow key, to each minimum with Home and End, and Enter evens out its split", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, row([0.5, "c"], [0.5, "gmail"]));

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.url);
  await expect.poll(() => paneWidths(shell)).toHaveLength(2);

  const [left = 0, right = 0] = await paneWidths(shell);
  const total = left + right;

  await handle(shell).focus();
  await expect(handle(shell)).toHaveAttribute(
    "aria-valuetext",
    "Left pane 50%"
  );
  await shell.keyboard.press("ArrowRight");
  await expect
    .poll(() => paneWidths(shell))
    .toStrictEqual([left + STEP, right - STEP]);
  await shell.keyboard.press("ArrowLeft");
  await shell.keyboard.press("ArrowLeft");
  await expect
    .poll(() => paneWidths(shell))
    .toStrictEqual([left - STEP, right + STEP]);
  // Up and Down move a gap between panes stacked, not this one.
  await shell.keyboard.press("ArrowDown");
  // End straight after a step, before the step's sizes come back.
  await shell.keyboard.press("ArrowRight");
  await shell.keyboard.press("End");
  await expect
    .poll(() => paneWidths(shell))
    .toStrictEqual([total - MINIMUM, MINIMUM]);
  await shell.keyboard.press("ArrowRight");
  await shell.keyboard.press("Home");
  await expect
    .poll(() => paneWidths(shell))
    .toStrictEqual([MINIMUM, total - MINIMUM]);
  await expect(handle(shell)).toBeFocused();
  await shell.keyboard.press("Enter");
  await expect.poll(() => paneWidths(shell)).toStrictEqual([left, right]);
  await expect.poll(() => storedShares(userDataDir)).toStrictEqual([0.5, 0.5]);
});

test("Maximize from its shortcut shows the focused pane alone, the others kept loaded; another tab of the box shows maximized; the box's Restore brings every pane back; the tab menu maximizes its tab; a relaunch keeps it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, row([0.5, "c"], [0.5, "gmail"]));

  const first = await launchApp();
  const shell = await findPage(first, "meru-app:");
  const restore = shell.getByRole("button", {
    name: "Restore panes",
    includeHidden: true,
  });

  await findPage(first, standIn.url);
  await expect.poll(() => shownWidths(first)).toHaveLength(2);

  // The box is drawn once the shell has the tabs, which the views need not wait for.
  await expect.poll(() => boxFill(shell)).toBeDefined();

  const evenFill = await boxFill(shell);

  expect(await readMenuLabel(first, "tab.maximize")).toBe("Maximize Pane");
  // The key goes to the page with focus, as a click there gives it; which
  // pane's page holds focus after launch differs by platform.
  await focusPage(first, standIn.calendarUrl);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await pressMaximize(first, standIn.calendarUrl);
  await expect
    .poll(() => shownWidths(first).then((shown) => shown.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl]);
  await expect
    .poll(() => readViews(first).then(({ views }) => views.length))
    .toBe(2);
  await expect(handle(shell)).toHaveCount(0);
  await expect(restore).toBeVisible();
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAccessibleDescription(
    "In split view, maximized"
  );
  await expect.poll(() => boxFill(shell)).not.toBe(evenFill);
  await expect
    .poll(() => readMenuLabel(first, "tab.maximize"))
    .toBe("Restore Panes");
  await expect
    .poll(() => storedSplit(userDataDir).then((split) => split?.maximized))
    .toBe(true);

  await tab(shell, STAND_IN_TITLE).click();
  await expect
    .poll(() => shownWidths(first).then((shown) => shown.map(({ url }) => url)))
    .toStrictEqual([standIn.url]);

  await tab(shell, DRIVE_TITLE).click();
  await findPage(first, standIn.driveUrl);
  await expect
    .poll(() => shownWidths(first).then((shown) => shown.map(({ url }) => url)))
    .toStrictEqual([standIn.driveUrl]);
  // Restore from outside the split selects the box's first tab, Gmail,
  // which the store pins, and so shows the split.
  await restore.click();
  await expect(restore).toHaveCount(0);
  await expect(tab(shell, STAND_IN_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect.poll(() => shownWidths(first)).toHaveLength(2);
  await expect.poll(() => boxFill(shell)).toBe(evenFill);

  await tab(shell, CALENDAR_TITLE).click();
  await expect.poll(() => shownWidths(first)).toHaveLength(2);

  await openContextMenu(first, () =>
    tab(shell, STAND_IN_TITLE).click({ button: "right" })
  );
  await chooseContextMenuItem(first, "Maximize pane");
  await expect
    .poll(() => shownWidths(first).then((shown) => shown.map(({ url }) => url)))
    .toStrictEqual([standIn.url]);
  await expect(tab(shell, STAND_IN_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect
    .poll(() => storedSplit(userDataDir).then((split) => split?.maximized))
    .toBe(true);
  await expect.poll(() => storedSelected(userDataDir)).toBe("gmail");
  await first.close();

  const app = await launchApp();
  const again = await findPage(app, "meru-app:");

  await findPage(app, standIn.url);
  await expect(
    again.getByRole("button", { name: "Restore panes", includeHidden: true })
  ).toBeVisible();
  await expect
    .poll(() => shownWidths(app).then((shown) => shown.map(({ url }) => url)))
    .toStrictEqual([standIn.url]);

  await openContextMenu(app, () =>
    tab(again, STAND_IN_TITLE).click({ button: "right" })
  );
  await chooseContextMenuItem(app, "Restore panes");
  await expect.poll(() => shownWidths(app)).toHaveLength(2);
  await findPage(app, standIn.calendarUrl);
});

/** Records the Enter presses the page itself gets. */
const followEnters = (page: Page) =>
  page.evaluate(() => {
    Reflect.set(globalThis, "meruEnters", 0);
    globalThis.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        Reflect.set(
          globalThis,
          "meruEnters",
          (Reflect.get(globalThis, "meruEnters") as number) + 1
        );
      }
    });
  });

const enters = (page: Page) =>
  page.evaluate(() => Reflect.get(globalThis, "meruEnters") as number);

test("Maximize's shortcut is taken from the page in a split, and outside one is left to the page, the command unavailable", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, row([0.5, "c"], [0.5, "gmail"]), true);

  const app = await launchApp();
  const calendar = await findPage(app, standIn.calendarUrl);

  await expect
    .poll(() => shownWidths(app).then((shown) => shown.map(({ url }) => url)))
    .toStrictEqual([standIn.calendarUrl]);
  await followEnters(calendar);

  await pressMaximize(app, standIn.calendarUrl);
  await expect.poll(() => shownWidths(app)).toHaveLength(2);
  expect(await enters(calendar)).toBe(0);

  await clickMenuItem(app, "tab.separate");
  await expect.poll(() => storedSplit(userDataDir)).toBeUndefined();
  await expect
    .poll(() =>
      app.evaluate(
        ({ Menu }) =>
          Menu.getApplicationMenu()?.getMenuItemById("tab.maximize")?.enabled
      )
    )
    .toBe(false);
  await pressMaximize(app, standIn.calendarUrl);
  await expect.poll(() => enters(calendar)).toBe(1);
  expect(await storedSplit(userDataDir)).toBeUndefined();
});
