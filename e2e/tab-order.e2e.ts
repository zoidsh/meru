import type { ElectronApplication, Locator, Page } from "@playwright/test";

import { expect, findPage, readState, test, writeState } from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { CALENDAR_TITLE, DRIVE_TITLE, STAND_IN_TITLE } from "./lib/stand-in.ts";

const DOCS = "Docs one";
const SHEETS = "Sheets one";
const SLIDES = "Slides one";

/**
 * Gmail, Drive and Docs pinned, Calendar, Sheets and Slides listed, with
 * Calendar selected; the others never load, so keep their titles.
 */
const seed = (userDataDir: string, standIn: StandIn) =>
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
          {
            id: "d",
            app: "drive",
            url: standIn.driveUrl,
            title: DRIVE_TITLE,
            pinned: true,
          },
          {
            id: "o",
            app: "docs",
            url: standIn.driveUrl,
            title: DOCS,
            pinned: true,
          },
          { id: "s", app: "sheets", url: standIn.driveUrl, title: SHEETS },
          { id: "l", app: "slides", url: standIn.driveUrl, title: SLIDES },
        ],
        selectedTabId: "c",
      },
    ],
    selectedProfileId: "p",
  });

const tabs = (shell: Page) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab");

const tab = (shell: Page, title: string) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab", {
    name: title,
    exact: true,
  });

const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn,
  { seeded = false } = {}
) => {
  if (!seeded) {
    await seed(userDataDir, standIn);
  }

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.url);
  await expect(tab(shell, STAND_IN_TITLE)).toBeVisible();

  return { app, shell };
};

const PINNED = [STAND_IN_TITLE, DRIVE_TITLE, DOCS];
const LISTED = [CALENDAR_TITLE, SHEETS, SLIDES];

/** A point of a tile: `share` of the way across it and down it. */
const pointOf = async (tile: Locator, across: number, down: number) => {
  const box = await tile.boundingBox();

  return {
    x: (box?.x ?? 0) + (box?.width ?? 0) * across,
    y: (box?.y ?? 0) + (box?.height ?? 0) * down,
  };
};

/**
 * Presses the tile, moves the pointer in steps to `to` and leaves it held
 * there, as a person drags.
 */
const hold = async (
  shell: Page,
  tile: Locator,
  to: { x: number; y: number }
) => {
  const from = await pointOf(tile, 0.5, 0.5);

  await shell.mouse.move(from.x, from.y);
  await shell.mouse.down();
  await shell.mouse.move(to.x, to.y, { steps: 8 });
};

const drag = async (
  shell: Page,
  tile: Locator,
  to: { x: number; y: number }
) => {
  await hold(shell, tile, to);
  await shell.mouse.up();
};

const storedIds = async (userDataDir: string) => {
  const { profiles } = await readState<{
    profiles: { tabs: { id: string }[] }[];
  }>(userDataDir);

  return profiles[0]?.tabs.map((each) => each.id);
};

test("dragging a listed tab moves it in the list, selects nothing, and the order is stored and kept after a restart", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const first = await launch(launchApp, userDataDir, standIn);

  await drag(
    first.shell,
    tab(first.shell, SLIDES),
    await pointOf(tab(first.shell, CALENDAR_TITLE), 0.5, 0.1)
  );
  await expect(tabs(first.shell)).toHaveText([
    ...PINNED,
    SLIDES,
    CALENDAR_TITLE,
    SHEETS,
  ]);
  await expect(tab(first.shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect
    .poll(() => storedIds(userDataDir))
    .toStrictEqual(["gmail", "l", "c", "d", "o", "s"]);

  await first.app.close();

  const second = await launch(launchApp, userDataDir, standIn, {
    seeded: true,
  });

  await expect(tabs(second.shell)).toHaveText([
    ...PINNED,
    SLIDES,
    CALENDAR_TITLE,
    SHEETS,
  ]);
});

test("a pinned tile moves within the narrow pinned column and the wide pinned grid", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { shell } = await launch(launchApp, userDataDir, standIn);

  await drag(
    shell,
    tab(shell, DOCS),
    await pointOf(tab(shell, STAND_IN_TITLE), 0.5, 0.1)
  );
  await expect(tabs(shell)).toHaveText([
    DOCS,
    STAND_IN_TITLE,
    DRIVE_TITLE,
    ...LISTED,
  ]);

  await shell.getByRole("button", { name: "Expand sidebar" }).click();
  // The tiles grow with the sidebar, so they are measured once it is wide.
  await expect
    .poll(() =>
      tab(shell, STAND_IN_TITLE)
        .boundingBox()
        .then((box) => box?.width)
    )
    .toBeGreaterThan(64);
  // Docs and Gmail share the first row, Drive spans the second: Drive to the
  // right of Gmail, then Docs below Drive.
  await drag(
    shell,
    tab(shell, DRIVE_TITLE),
    await pointOf(tab(shell, STAND_IN_TITLE), 0.9, 0.5)
  );
  await expect(tabs(shell)).toHaveText([
    DOCS,
    STAND_IN_TITLE,
    DRIVE_TITLE,
    ...LISTED,
  ]);
  await drag(
    shell,
    tab(shell, STAND_IN_TITLE),
    await pointOf(tab(shell, DOCS), 0.1, 0.5)
  );
  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    DOCS,
    DRIVE_TITLE,
    ...LISTED,
  ]);
  await drag(
    shell,
    tab(shell, DOCS),
    await pointOf(tab(shell, DRIVE_TITLE), 0.5, 0.9)
  );
  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    DRIVE_TITLE,
    DOCS,
    ...LISTED,
  ]);
});

test("a drag across areas, onto the titlebar or ended with Escape moves nothing, and a short press still selects", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { shell } = await launch(launchApp, userDataDir, standIn);
  const before = [...PINNED, ...LISTED];

  await drag(
    shell,
    tab(shell, SHEETS),
    await pointOf(tab(shell, STAND_IN_TITLE), 0.5, 0.1)
  );
  await drag(
    shell,
    tab(shell, DRIVE_TITLE),
    await pointOf(tab(shell, CALENDAR_TITLE), 0.5, 0.9)
  );
  // Into the page a drop splits; the titlebar is no place to drop.
  await drag(shell, tab(shell, SLIDES), { x: 600, y: 20 });
  await hold(
    shell,
    tab(shell, SLIDES),
    await pointOf(tab(shell, CALENDAR_TITLE), 0.5, 0.1)
  );
  await shell.keyboard.press("Escape");
  await shell.mouse.up();

  await expect(tabs(shell)).toHaveText(before);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );

  // Drive, whose stand-in its app claims; Sheets would load Google's own.
  const drive = await pointOf(tab(shell, DRIVE_TITLE), 0.5, 0.5);

  await shell.mouse.move(drive.x, drive.y);
  await shell.mouse.down();
  await shell.mouse.move(drive.x + 2, drive.y + 1);
  await shell.mouse.up();
  await expect(tab(shell, DRIVE_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(tabs(shell)).toHaveText(before);
});

test("Alt with the arrows moves a focused tab within its area, keeping focus, and says where it is", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { shell } = await launch(launchApp, userDataDir, standIn);
  const sheets = tab(shell, SHEETS);

  await sheets.focus();
  await sheets.press("Alt+ArrowUp");
  await expect(tabs(shell)).toHaveText([
    ...PINNED,
    SHEETS,
    CALENDAR_TITLE,
    SLIDES,
  ]);
  await expect(sheets).toBeFocused();
  await expect(shell.getByText(`${SHEETS}, position 1 of 3`)).toHaveRole(
    "status"
  );

  // At the list's top, and never into the pinned area.
  await sheets.press("Alt+ArrowUp");
  await expect(shell.getByText(`${SHEETS}, already first`)).toHaveRole(
    "status"
  );
  await sheets.press("Alt+ArrowDown");
  await expect(tabs(shell)).toHaveText([
    ...PINNED,
    CALENDAR_TITLE,
    SHEETS,
    SLIDES,
  ]);
  await expect(sheets).toBeFocused();

  await shell.getByRole("button", { name: "Expand sidebar" }).click();

  const gmail = tab(shell, STAND_IN_TITLE);

  await gmail.focus();
  await gmail.press("Alt+ArrowRight");
  await expect(tabs(shell)).toHaveText([
    DRIVE_TITLE,
    STAND_IN_TITLE,
    DOCS,
    CALENDAR_TITLE,
    SHEETS,
    SLIDES,
  ]);
  await expect(gmail).toBeFocused();
  await expect(
    shell.getByText(`${STAND_IN_TITLE}, position 2 of 3`)
  ).toHaveRole("status");

  // A tile at the grid's start leaves Alt+Left unprevented; one that
  // moves takes it.
  await shell.evaluate(() => {
    globalThis.addEventListener("keydown", (event) => {
      Reflect.set(globalThis, "meruPrevented", event.defaultPrevented);
    });
  });

  const prevented = () =>
    shell.evaluate(() => Reflect.get(globalThis, "meruPrevented") as boolean);
  const drive = tab(shell, DRIVE_TITLE);

  await drive.focus();
  await drive.press("Alt+ArrowLeft");
  await expect(shell.getByText(`${DRIVE_TITLE}, already first`)).toHaveRole(
    "status"
  );
  expect(await prevented()).toBe(false);
  await gmail.focus();
  await gmail.press("Alt+ArrowLeft");
  await expect(tabs(shell).first()).toHaveText(STAND_IN_TITLE);
  expect(await prevented()).toBe(true);
});
