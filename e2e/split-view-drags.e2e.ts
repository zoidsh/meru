import type { Page } from "@playwright/test";
import { delay } from "es-toolkit";

import {
  expect,
  findOverlayDocument,
  findPage,
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
 * Gmail, pinned, then Calendar, selected, and three Drive tabs, `o`, `d`
 * and `s`, with `root` as their split if given, maximized if asked; only
 * the stand-ins' apps load in a pane, so the tests find a tab by its id.
 */
const seed = (
  userDataDir: string,
  standIn: StandIn,
  root?: Tree,
  maximized = false
) =>
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
        ...(root && { split: { root, ...(maximized && { maximized }) } }),
      },
    ],
    selectedProfileId: "p",
  });

interface Stored {
  selectedTabId: string;
  split?: { root: Tree; maximized?: boolean };
}

const stored = async (userDataDir: string) => {
  const { profiles } = await readState<{ profiles: Stored[] }>(userDataDir);

  return profiles[0];
};

const describeTree = (tree: string | Tree): string =>
  typeof tree === "string"
    ? tree
    : `${tree.direction}(${tree.children.map((child) => describeTree(child.pane)).join(" ")})`;

/** The split as stored, written out, such as `row(c column(o d))`; none without one. */
const storedTree = async (userDataDir: string) => {
  const profile = await stored(userDataDir);

  return profile?.split ? describeTree(profile.split.root) : "none";
};

/** The outer panes' shares, in thousandths. */
const storedShares = async (userDataDir: string) => {
  const profile = await stored(userDataDir);

  return profile?.split?.root.children.map(({ size }) =>
    Math.round(size * 1000)
  );
};

const storedSelected = async (userDataDir: string) => {
  const profile = await stored(userDataDir);

  return profile?.selectedTabId;
};

/** Whether `selector` names an element drawn with a size. */
const isDrawn = (shell: Page, selector: string) =>
  shell.evaluate(
    (each) =>
      (document.querySelector(each)?.getBoundingClientRect().width ?? 0) > 0,
    selector
  );

/** Waits for `selector` to be drawn, as a person waits to see what they drag. */
const seen = (shell: Page, selector: string) =>
  expect.poll(() => isDrawn(shell, selector)).toBe(true);

const rectOf = (shell: Page, selector: string) =>
  shell.evaluate((each) => {
    const { x, y, width, height } =
      document.querySelector(each)?.getBoundingClientRect() ?? new DOMRect();

    return { x, y, width, height };
  }, selector);

/** A point `across` and `down` of the way over `selector`'s element, once drawn. */
const pointOf = async (
  shell: Page,
  selector: string,
  across: number,
  down: number
) => {
  await seen(shell, selector);

  const { x, y, width, height } = await rectOf(shell, selector);

  return { x: x + width * across, y: y + height * down };
};

/** `pointOf` as the arguments `mouse.move` takes. */
const xy = async (
  shell: Page,
  selector: string,
  across: number,
  down: number
): Promise<[number, number]> => {
  const { x, y } = await pointOf(shell, selector, across, down);

  return [x, y];
};

const tab = (tabId: string) => `[data-tab-id="${tabId}"]`;
const pane = (tabId: string) => `[data-pane="${tabId}"]`;
const AREA = "[data-page-area]";

/** Presses on the tab `tabId` and moves in steps to `to`, holding the button. */
const holdOver = async (
  shell: Page,
  tabId: string,
  to: { x: number; y: number }
) => {
  const from = await pointOf(shell, tab(tabId), 0.5, 0.5);

  await shell.mouse.move(from.x, from.y);
  await shell.mouse.down();
  await shell.mouse.move(to.x, to.y, { steps: 8 });
};

/**
 * Waits for nothing to show over the pages, then for a while that the
 * stored split stays `tree`, so a drop that would change it has had time to.
 */
const staysUnchanged = async (
  overlay: Page,
  userDataDir: string,
  tree: string
) => {
  await expect.poll(() => zoneShown(overlay)).toBe("none");

  for (let check = 0; check < 5; check += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one check after another
    expect(await storedTree(userDataDir)).toBe(tree);
    // oxlint-disable-next-line no-await-in-loop -- spaced out over half a second
    await delay(100);
  }
};

/**
 * What lights up over the pages, in the page area, and how it reads; none
 * when nothing does. `drawnPointerEvents` is the zone's CSS alone: whether
 * the pages under the overlay's native view would take a real press is the
 * view's to say, not its document's, and Playwright's input reaches the
 * shell alone, so the suite cannot send one there; mid-drag none should,
 * since the shell holds the pointer's capture from the press.
 */
const zoneShown = (overlay: Page) =>
  overlay.evaluate(() => {
    const zone = document.querySelector<HTMLElement>("[data-drop-zone]");

    if (!zone) {
      return "none";
    }

    const { x, y, width, height } = zone.getBoundingClientRect();

    return {
      kind: zone.dataset.dropZone,
      label: zone.textContent,
      rect: [x, y, width, height].map((each) => Math.round(each)),
      drawnPointerEvents: getComputedStyle(zone).pointerEvents,
    };
  });

const areaSize = async (shell: Page) => {
  const { width, height } = await rectOf(shell, AREA);

  return [Math.round(width), Math.round(height)] as const;
};

test("a tab dragged over the pages lights the nearest half of the pane under the pointer, drawn to let the pointer through, and its drop splits that pane that way; over its own page nothing lights", async ({
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

  const [width, height] = await areaSize(shell);
  const half = Math.round(width / 2);

  // Calendar alone is the one pane: its left half, then its right.
  await holdOver(shell, "d", await pointOf(shell, AREA, 0.1, 0.5));
  await expect
    .poll(() => zoneShown(overlay))
    .toStrictEqual({
      kind: "pane",
      label: "Split this pane",
      rect: [0, 0, half, height],
      drawnPointerEvents: "none",
    });
  await shell.mouse.move(...(await xy(shell, AREA, 0.9, 0.5)), { steps: 4 });
  await expect
    .poll(() => zoneShown(overlay).then((zone) => zone !== "none" && zone.rect))
    .toStrictEqual([width - half, 0, half, height]);
  await shell.mouse.up();
  await expect.poll(() => storedTree(userDataDir)).toBe("row(c d)");
  expect(await storedSelected(userDataDir)).toBe("d");
  await expect.poll(() => zoneShown(overlay)).toBe("none");

  // `d`, in the split already, moved to Calendar's left half, which ends
  // the split and starts it again; `s` on Calendar's bottom half; `o` on
  // Drive's top half.
  await holdOver(shell, "d", await pointOf(shell, pane("c"), 0.1, 0.5));
  await shell.mouse.up();
  await expect.poll(() => storedTree(userDataDir)).toBe("row(d c)");

  await holdOver(shell, "s", await pointOf(shell, pane("c"), 0.5, 0.9));
  await shell.mouse.up();
  await expect.poll(() => storedTree(userDataDir)).toBe("row(d column(c s))");

  await holdOver(shell, "o", await pointOf(shell, pane("d"), 0.5, 0.1));
  await shell.mouse.up();
  await expect
    .poll(() => storedTree(userDataDir))
    .toBe("row(column(o d) column(c s))");
  await expect
    .poll(() =>
      readViews(app).then(
        ({ views }) => views.filter((view) => view.visible).length
      )
    )
    .toBe(4);
  await expect(
    overlay.getByText("Not enough room to split", { exact: true })
  ).toHaveCount(0);

  // Over its own page a tab lands nothing.
  await holdOver(shell, "s", await pointOf(shell, pane("s"), 0.5, 0.5));
  await expect.poll(() => zoneShown(overlay)).toBe("none");
  await shell.mouse.up();
  await staysUnchanged(overlay, userDataDir, "row(column(o d) column(c s))");
});

test("near the view's outer edge a tab goes along it with a third of the view; a drop that would leave a pane too small says so and does nothing; Escape ends the drag", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, row("c", "d"));

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);
  await sizeWindow(app, 1000, 700);
  await seen(shell, pane("d"));

  const [, height] = await areaSize(shell);
  const area = await rectOf(shell, AREA);

  // In the window's inset below the view, which counts as its edge.
  await holdOver(shell, "o", {
    x: area.x + area.width / 2,
    y: area.y + area.height + 4,
  });
  await expect
    .poll(() => zoneShown(overlay).then((zone) => zone !== "none" && zone.kind))
    .toBe("edge");
  await shell.mouse.move(area.x + 4, area.y + area.height / 2, { steps: 4 });
  await expect
    .poll(() => zoneShown(overlay))
    .toMatchObject({
      kind: "edge",
      label: "Along the whole view",
      drawnPointerEvents: "none",
    });

  const band = await zoneShown(overlay);

  expect(band !== "none" && band.rect.slice(0, 2)).toStrictEqual([0, 0]);
  expect(band !== "none" && band.rect[3]).toBe(height);
  await shell.mouse.up();
  await expect.poll(() => storedTree(userDataDir)).toBe("row(o c d)");
  expect(await storedShares(userDataDir)).toStrictEqual([333, 333, 333]);

  // Too narrow for a fourth pane.
  await sizeWindow(app, 820, 600);
  await expect
    .poll(() => areaSize(shell))
    .not.toStrictEqual([area.width, height].map(Math.round));
  await holdOver(shell, "s", await pointOf(shell, pane("d"), 0.1, 0.5));
  await expect
    .poll(() => zoneShown(overlay))
    .toMatchObject({
      kind: "no-room",
      label: "Not enough room",
    });
  await shell.mouse.up();
  await staysUnchanged(overlay, userDataDir, "row(o c d)");
  await expect(
    overlay.getByText("Not enough room to split", { exact: true })
  ).toHaveCount(0);

  await holdOver(shell, "s", await pointOf(shell, pane("c"), 0.5, 0.1));
  await expect.poll(() => zoneShown(overlay)).not.toBe("none");
  await shell.keyboard.press("Escape");
  await expect.poll(() => zoneShown(overlay)).toBe("none");
  await shell.mouse.up();
  await staysUnchanged(overlay, userDataDir, "row(o c d)");
});

test("over a maximized split, which shows as one pane, a tab takes half the view and the whole split, restored, the other half", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, row("c", "d"), true);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);

  await findPage(app, standIn.calendarUrl);
  await sizeWindow(app, 1000, 700);

  const [width, height] = await areaSize(shell);
  const half = Math.round(height / 2);

  await holdOver(shell, "o", await pointOf(shell, AREA, 0.5, 0.8));
  await expect
    .poll(() => zoneShown(overlay))
    .toMatchObject({
      kind: "pane",
      label: "Split this pane",
      rect: [0, height - half, width, half],
    });
  await shell.mouse.up();
  await expect.poll(() => storedTree(userDataDir)).toBe("column(row(c d) o)");

  const { split } = (await stored(userDataDir)) ?? {};

  expect(split?.maximized).toBeUndefined();
  expect(split?.root.children.map(({ size }) => size)).toStrictEqual([
    0.5, 0.5,
  ]);
  await expect
    .poll(() =>
      readViews(app).then(
        ({ views }) => views.filter((view) => view.visible).length
      )
    )
    .toBe(3);
});
