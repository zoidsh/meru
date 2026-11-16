import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { TAB_STRIP_WIDTH, contentViewBounds } from "#core/layout.ts";

import { expect, findPage, test } from "./lib/app.ts";
import { CALENDAR_TITLE, DRAFT_LABEL, STAND_IN_TITLE } from "./lib/stand-in.ts";

/**
 * Records the radius each view is given from now on, since a view has no
 * getter for it.
 */
const recordRadii = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const radii: number[] = [];
    const [view] = BrowserWindow.getAllWindows()[0]?.contentView.children ?? [];
    let owner: object | null = view ?? null;

    while (owner && !Object.hasOwn(owner, "setBorderRadius")) {
      owner = Object.getPrototypeOf(owner) as object | null;
    }

    if (!owner) {
      throw new Error("No view to record the radius of");
    }

    const original = Reflect.get(owner, "setBorderRadius") as (
      this: Electron.View,
      radius: number
    ) => void;

    Reflect.set(globalThis, "radii", radii);
    Reflect.set(
      owner,
      "setBorderRadius",
      function setBorderRadius(this: Electron.View, radius: number) {
        radii.push(radius);
        original.call(this, radius);
      }
    );
  });

const readRadii = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "radii") as number[]);

/**
 * The root view's size and the window's content size, which differ by a menu
 * bar's height where one shows, and where the view sits.
 */
const readLayout = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    const { width, height } = window.contentView.getBounds();
    const [contentWidth = 0, contentHeight = 0] = window.getContentSize();

    return {
      area: { width, height },
      content: { width: contentWidth, height: contentHeight },
      menuBarVisible: window.isMenuBarVisible(),
      views: window.contentView.children.map((view) => view.getBounds()),
    };
  });

/**
 * Clicks the application menu's item, as a person choosing it would with
 * focus in the page at `focusedUrl`. The suite's app is never the active app,
 * so the system says of no page that it has focus.
 */
const clickMenuItem = (
  app: ElectronApplication,
  id: string,
  focusedUrl?: string
) =>
  app.evaluate(
    ({ Menu, BrowserWindow, webContents }, { itemId, url }) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);

      if (!item) {
        throw new Error(`The application menu has no ${itemId}`);
      }

      const focused =
        url === undefined
          ? undefined
          : webContents
              .getAllWebContents()
              .find((candidate) => candidate.getURL().startsWith(url));

      item.click(undefined, BrowserWindow.getAllWindows()[0], focused);
    },
    { itemId: id, url: focusedUrl }
  );

const menuItemState = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);

    return { checked: item?.checked, enabled: item?.enabled };
  }, id);

const readViewBounds = async (app: ElectronApplication) => {
  const { views } = await readLayout(app);

  return views;
};

/** The padding the shell gives its content area, around where the view sits. */
const drawnPadding = (shell: Page) =>
  shell
    .getByRole("main", { name: "Content" })
    .evaluate((main) => getComputedStyle(main).padding);

const zoomOf = (app: ElectronApplication, url: string) =>
  app.evaluate(
    ({ webContents }, prefix) =>
      webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(prefix))
        ?.getZoomLevel(),
    url
  );

const readSettings = async (userDataDir: string) =>
  JSON.parse(
    await readFile(path.join(userDataDir, "settings.json"), "utf-8")
  ) as Record<string, unknown>;

test("the View menu switches between the modern and classic designs without loading the page again, and the choice survives a relaunch", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const app = await launchApp();

  await findPage(app, standIn.url);

  const shell = await findPage(app, "meru-app:");
  const first = await readLayout(app);

  // On Windows and Linux the menu bar stays hidden and takes no height.
  expect(first.menuBarVisible).toBe(process.platform === "darwin");
  expect(first.area).toStrictEqual(first.content);
  expect(first.views).toStrictEqual([
    contentViewBounds(first.area, TAB_STRIP_WIDTH, "modern"),
  ]);
  expect(await menuItemState(app, "design.modern")).toStrictEqual({
    checked: true,
    enabled: true,
  });
  await expect.poll(() => drawnPadding(shell)).toBe("0px 8px 8px");

  await recordRadii(app);
  await clickMenuItem(app, "design.classic");

  await expect
    .poll(() => readViewBounds(app))
    .toStrictEqual([contentViewBounds(first.area, TAB_STRIP_WIDTH, "classic")]);
  expect(await readRadii(app)).toStrictEqual([0]);
  await expect.poll(() => drawnPadding(shell)).toBe("0px");
  await expect
    .poll(() => menuItemState(app, "design.classic"))
    .toStrictEqual({ checked: true, enabled: true });
  expect(await readSettings(userDataDir)).toMatchObject({ design: "classic" });

  await clickMenuItem(app, "design.modern");

  await expect
    .poll(() => readViewBounds(app))
    .toStrictEqual([contentViewBounds(first.area, TAB_STRIP_WIDTH, "modern")]);
  expect(await readRadii(app)).toStrictEqual([0, 8]);

  await clickMenuItem(app, "design.classic");
  await expect
    .poll(() => readSettings(userDataDir))
    .toMatchObject({ design: "classic" });
  // The page was asked for once, at launch.
  expect(standIn.requests().gmail).toBe(1);

  await app.close();

  const relaunched = await launchApp();

  await findPage(relaunched, standIn.url);

  const { area, views } = await readLayout(relaunched);

  expect(views).toStrictEqual([
    contentViewBounds(area, TAB_STRIP_WIDTH, "classic"),
  ]);
  expect(await menuItemState(relaunched, "design.classic")).toMatchObject({
    checked: true,
  });
});

test("the View menu's zoom items zoom the page with focus, and Actual Size sets it back", async ({
  app,
  standIn,
}) => {
  await findPage(app, standIn.url);

  await clickMenuItem(app, "view.zoomIn", standIn.url);
  await clickMenuItem(app, "view.zoomIn", standIn.url);
  await clickMenuItem(app, "view.zoomOut", standIn.url);

  expect([
    await zoomOf(app, standIn.url),
    await zoomOf(app, "meru-app:"),
  ]).toStrictEqual([0.5, 0]);

  await clickMenuItem(app, "view.resetZoom", standIn.url);

  expect(await zoomOf(app, standIn.url)).toBe(0);
});

const selectedTab = (shell: Page) =>
  shell
    .getByRole("tablist", { name: "Tabs" })
    .getByRole("tab", { selected: true });

test("the next tab's shortcut works while focus is inside the content view", async ({
  app,
  shell,
  standIn,
}) => {
  const gmail = await findPage(app, standIn.url);

  await gmail.getByRole("link", { name: "Open Calendar" }).click();
  await expect(selectedTab(shell)).toHaveText(CALENDAR_TITLE);

  const calendar = await findPage(app, standIn.calendarUrl);

  await calendar.getByRole("link", { name: "Next week" }).focus();
  // As the system hands a key to the view, which a page's own keyboard
  // events, sent past the app, are not.
  await app.evaluate(({ webContents }, url) => {
    const view = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith(url));

    for (const type of ["keyDown", "keyUp"] as const) {
      view?.sendInputEvent({ type, keyCode: "Tab", modifiers: ["control"] });
    }
  }, standIn.calendarUrl);

  await expect(selectedTab(shell)).toHaveText(STAND_IN_TITLE);
});

test("copy and paste work inside a page through the Edit menu", async ({
  app,
  standIn,
}) => {
  // macOS sends a role's action to the key window, and the suite's app never
  // has one, since it can never be the active app.
  test.skip(
    process.platform === "darwin",
    "The Edit roles need the active app on macOS"
  );

  const gmail = await findPage(app, standIn.url);
  const draft = gmail.getByRole("textbox", { name: DRAFT_LABEL });
  // The clipboard is the desktop's, which other work shares.
  const before = await app.evaluate(({ clipboard }) => clipboard.readText());

  try {
    await draft.fill("Paste me");
    await draft.focus();
    await clickMenuItem(app, "edit.selectAll", standIn.url);
    await clickMenuItem(app, "edit.copy", standIn.url);
    await draft.press("End");
    await clickMenuItem(app, "edit.paste", standIn.url);

    await expect(draft).toHaveValue("Paste mePaste me");
  } finally {
    await app.evaluate(({ clipboard }, text) => {
      clipboard.writeText(text);
    }, before);
  }
});
