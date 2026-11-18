import type { ElectronApplication, Page } from "@playwright/test";

import {
  expect,
  findPage,
  readState,
  readViews,
  test,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { CALENDAR_TITLE, DRIVE_TITLE } from "./lib/stand-in.ts";

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
const seed = (userDataDir: string, standIn: StandIn, root: Tree) =>
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
        split: { root },
      },
    ],
    selectedProfileId: "p",
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
    profiles: { split?: { root: Tree } }[];
  }>(userDataDir);

  return profiles[0]?.split;
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

  const uneven = await middleOf(shell);

  await shell.mouse.move(uneven.x, uneven.y);
  await shell.mouse.down();
  await shell.mouse.move(uneven.x - 80, uneven.y, { steps: 3 });
  await shell.mouse.up();
  await expect
    .poll(() => paneWidths(shell))
    .toStrictEqual([(left?.width ?? 0) + 2 - 80, (right?.width ?? 0) + 2 + 80]);

  const widths = await paneWidths(shell);

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
  await shell.keyboard.press("End");
  await expect
    .poll(() => paneWidths(shell))
    .toStrictEqual([total - MINIMUM, MINIMUM]);
  await shell.keyboard.press("Home");
  await expect
    .poll(() => paneWidths(shell))
    .toStrictEqual([MINIMUM, total - MINIMUM]);
  await expect(handle(shell)).toBeFocused();
  await shell.keyboard.press("Enter");
  await expect.poll(() => paneWidths(shell)).toStrictEqual([left, right]);
  await expect.poll(() => storedShares(userDataDir)).toStrictEqual([0.5, 0.5]);
});
