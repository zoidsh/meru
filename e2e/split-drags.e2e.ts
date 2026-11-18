import type { Page } from "@playwright/test";

import {
  expect,
  findOverlayDocument,
  findPage,
  readState,
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
 * Gmail, pinned, then Calendar, selected, and three Drive tabs, `o`, `d`
 * and `s`, with `root` as their split if given. Only the stand-ins' apps
 * load in a pane, and a loaded Drive tab takes its page's title, so the
 * tests find a tab by its id.
 */
const seed = (userDataDir: string, standIn: StandIn, root?: Tree) =>
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
        ...(root && { splits: [{ root }] }),
      },
    ],
    selectedProfileId: "p",
  });

interface Stored {
  tabs: { id: string; pinned?: boolean }[];
  selectedTabId: string;
  splits?: { root: Tree }[];
}

const stored = async (userDataDir: string) => {
  const { profiles } = await readState<{ profiles: Stored[] }>(userDataDir);

  return profiles[0];
};

const leaves = (tree: string | Tree): string[] =>
  typeof tree === "string"
    ? [tree]
    : tree.children.flatMap((child) => leaves(child.pane));

/** The split's panes in reading order as stored, or none. */
const storedPanes = async (userDataDir: string) => {
  const profile = await stored(userDataDir);

  const split = profile?.splits?.[0];

  return split ? leaves(split.root) : [];
};

const storedOrder = async (userDataDir: string) => {
  const profile = await stored(userDataDir);

  return profile?.tabs.map((each) => each.id);
};

const storedPinned = async (userDataDir: string, tabId: string) => {
  const profile = await stored(userDataDir);

  return profile?.tabs.find((each) => each.id === tabId)?.pinned;
};

const storedSelected = async (userDataDir: string) => {
  const profile = await stored(userDataDir);

  return profile?.selectedTabId;
};

/** The shares of the split's outer panes, in thousandths. */
const storedShares = async (userDataDir: string) => {
  const profile = await stored(userDataDir);

  return profile?.splits?.[0]?.root.children.map(({ size }) =>
    Math.round(size * 1000)
  );
};

/** The sidebar's tabs top to bottom, and the box's. */
const drawn = (shell: Page) =>
  shell.evaluate(() => ({
    tabs: [...document.querySelectorAll<HTMLElement>("[data-tab-id]")].map(
      (each) => each.dataset.tabId
    ),
    box: [
      ...document.querySelectorAll<HTMLElement>(
        "[data-split-box] [data-tab-id]"
      ),
    ].map((each) => each.dataset.tabId),
  }));

/** Whether `selector` names an element drawn with a size. */
const isDrawn = (shell: Page, selector: string) =>
  shell.evaluate(
    (each) =>
      (document.querySelector(each)?.getBoundingClientRect().width ?? 0) > 0,
    selector
  );

/**
 * Waits for `selector` to be drawn, as a person waits to see what they
 * drag: the shell can draw the sidebar after the pages have loaded.
 */
const seen = (shell: Page, selector: string) =>
  expect.poll(() => isDrawn(shell, selector)).toBe(true);

const pointOf = async (shell: Page, tabId: string, down = 0.5) => {
  await seen(shell, `[data-tab-id="${tabId}"]`);

  return pointIn(shell, tabId, down);
};

const pointIn = (shell: Page, tabId: string, down: number) =>
  shell.evaluate(
    ([id, share]) => {
      const box = document
        .querySelector(`[data-tab-id="${id}"]`)
        ?.getBoundingClientRect();

      return {
        x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
        y: (box?.y ?? 0) + (box?.height ?? 0) * share,
      };
    },
    [tabId, down] as const
  );

const focusTab = (shell: Page, tabId: string) =>
  shell.evaluate((id) => {
    document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus();
  }, tabId);

const focusedTab = (shell: Page) =>
  shell.evaluate(
    () =>
      document.activeElement?.closest<HTMLElement>("[data-tab-id]")?.dataset
        .tabId
  );

/** A point of the box, `down` of the way from its top. */
const pointOfBox = async (shell: Page, down: number) => {
  await seen(shell, "[data-split-box]");

  return pointInBox(shell, down);
};

const pointInBox = (shell: Page, down: number) =>
  shell.evaluate((share) => {
    const box = document
      .querySelector("[data-split-box]")
      ?.getBoundingClientRect();

    return {
      x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.y ?? 0) + (box?.height ?? 0) * share,
    };
  }, down);

/** Halfway down the gap between the box and the list below it. */
const belowBox = (shell: Page) =>
  shell.evaluate(() => {
    const box = document
      .querySelector("[data-split-box]")
      ?.getBoundingClientRect();
    const list = document
      .querySelector('[data-tab-area="listed"]')
      ?.getBoundingClientRect();

    return {
      x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
      y: ((box?.bottom ?? 0) + (list?.top ?? 0)) / 2,
    };
  });

/** Presses on the tab `tabId` and moves in steps to `to`, holding the button. */
const holdOver = async (
  shell: Page,
  tabId: string,
  to: { x: number; y: number }
) => {
  const from = await pointOf(shell, tabId);

  await shell.mouse.move(from.x, from.y);
  await shell.mouse.down();
  await shell.mouse.move(to.x, to.y, { steps: 8 });
};

const dragTo = async (
  shell: Page,
  tabId: string,
  to: { x: number; y: number }
) => {
  await holdOver(shell, tabId, to);
  await shell.mouse.up();
};

/** What shows where the drag would land: a line, a ring, or nothing. */
const markShown = (shell: Page) =>
  shell.evaluate(
    () =>
      document.querySelector<HTMLElement>("[data-drag-mark]")?.dataset
        .dragMark ?? "none"
  );

const noRoom = (overlay: Page) =>
  overlay.getByText("Not enough room to split", { exact: true });

test("a tab dropped onto another tab's middle, which shows a ring, splits the two with it on the right; with no room the toast says so", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);

  await findPage(app, standIn.calendarUrl);
  await sizeWindow(app, 1000, 700);
  await holdOver(shell, "d", await pointOf(shell, "c"));
  await expect.poll(() => markShown(shell)).toBe("ring");
  await shell.mouse.up();
  await expect.poll(() => storedPanes(userDataDir)).toStrictEqual(["c", "d"]);
  expect(await storedSelected(userDataDir)).toBe("d");
  await expect
    .poll(() => drawn(shell).then(({ box }) => box))
    .toStrictEqual(["c", "d"]);
  await expect(noRoom(overlay)).toHaveCount(0);

  // Halving Drive's pane would leave both halves under the minimum.
  await sizeWindow(app, 720, 480);
  await dragTo(shell, "o", await pointOf(shell, "d"));
  await expect(noRoom(overlay)).toBeVisible();
  expect(await storedPanes(userDataDir)).toStrictEqual(["c", "d"]);
});

test("a pinned tab dropped onto a tab splits the two and keeps its pin", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);

  await findPage(app, standIn.calendarUrl);
  await sizeWindow(app, 1000, 700);
  await dragTo(shell, "gmail", await pointOf(shell, "c"));
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual(["c", "gmail"]);
  expect(await storedPinned(userDataDir, "gmail")).toBe(true);
  await expect(noRoom(overlay)).toHaveCount(0);
});

test("in the box an inset line moves a tab among its tabs and its pane with it, by a drag and by Alt with an arrow; Escape ends a drag with nothing moved", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, row("c", "o", "d"));

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.calendarUrl);
  await expect
    .poll(() => drawn(shell).then(({ box }) => box))
    .toStrictEqual(["c", "o", "d"]);

  // `d` to the box's top, above Calendar.
  await holdOver(shell, "d", await pointOf(shell, "c", 0.3));
  await expect.poll(() => markShown(shell)).toBe("line");
  await shell.mouse.up();
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual(["d", "c", "o"]);
  // The sizes stay with the places, and the panes take the tabs in their
  // new order: Drive from last to first moves each other one place on.
  expect(await storedShares(userDataDir)).toStrictEqual([333, 333, 333]);

  // Each press once the box shows the last one's order, as a person sees it.
  const boxShows = (...ids: string[]) =>
    expect.poll(() => drawn(shell).then(({ box }) => box)).toStrictEqual(ids);

  await boxShows("d", "c", "o");
  await focusTab(shell, "d");
  await shell.keyboard.press("Alt+ArrowDown");
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual(["c", "d", "o"]);
  await boxShows("c", "d", "o");
  await expect.poll(() => focusedTab(shell)).toBe("d");
  await expect(
    shell.getByRole("status").filter({ hasText: "position" })
  ).toHaveText(`${DRIVE_TITLE}, position 2 of 3`);
  await shell.keyboard.press("Alt+ArrowUp");
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual(["d", "c", "o"]);
  await boxShows("d", "c", "o");
  await expect.poll(() => focusedTab(shell)).toBe("d");
  await shell.keyboard.press("Alt+ArrowUp");
  await expect(
    shell.getByRole("status").filter({ hasText: "already" })
  ).toHaveText(`${DRIVE_TITLE}, already first`);

  await holdOver(shell, "d", await pointOf(shell, "o", 0.9));
  await expect.poll(() => markShown(shell)).toBe("line");
  await shell.keyboard.press("Escape");
  await expect.poll(() => markShown(shell)).toBe("none");
  await shell.mouse.up();
  expect(await storedPanes(userDataDir)).toStrictEqual(["d", "c", "o"]);
});

test("a tab dragged out of the box by a full-width line leaves the split for that place in the list, above the box, below it or at the end; a pinned tab leaves it pinned", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, row("gmail", "c", "o", "d"));

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.calendarUrl);
  await expect
    .poll(() => drawn(shell).then(({ box }) => box))
    .toStrictEqual(["gmail", "c", "o", "d"]);

  // Pinned, the box is first in the pinned area, and the list holds `s`
  // alone: `o` above it, then `d` below it, at the list's end.
  await dragTo(shell, "o", await pointOf(shell, "s", 0.1));
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual(["gmail", "c", "d"]);
  await expect
    .poll(() => storedOrder(userDataDir))
    .toStrictEqual(["gmail", "c", "d", "o", "s"]);

  await dragTo(shell, "d", await pointOf(shell, "s", 1.8));
  await expect
    .poll(() => storedPanes(userDataDir))
    .toStrictEqual(["gmail", "c"]);
  await expect
    .poll(() => storedOrder(userDataDir))
    .toStrictEqual(["gmail", "c", "o", "s", "d"]);

  // Gmail out of the box into the pinned area, below the box: the split
  // ends, and Gmail keeps its pin.
  await dragTo(shell, "gmail", await belowBox(shell));
  await expect.poll(() => storedPanes(userDataDir)).toStrictEqual([]);
  expect(await storedPinned(userDataDir, "gmail")).toBe(true);
});

test("a tab of a box in the list leaves the split above the box and below it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, row("c", "o", "d"));

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.calendarUrl);
  await expect
    .poll(() => drawn(shell).then(({ tabs }) => tabs))
    .toStrictEqual(["gmail", "c", "o", "d", "s"]);

  // Calendar, the box's first stored tab, just above the box.
  await dragTo(shell, "c", await pointOfBox(shell, 0.02));
  await expect.poll(() => storedPanes(userDataDir)).toStrictEqual(["o", "d"]);
  await expect
    .poll(() => drawn(shell).then(({ tabs }) => tabs))
    .toStrictEqual(["gmail", "c", "o", "d", "s"]);

  await dragTo(shell, "o", await pointOfBox(shell, 0.98));
  await expect.poll(() => storedPanes(userDataDir)).toStrictEqual([]);
  await expect
    .poll(() => storedOrder(userDataDir))
    .toStrictEqual(["gmail", "c", "d", "o", "s"]);
});
