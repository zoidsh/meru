import type { ElectronApplication, Page } from "@playwright/test";

import { contentViewBounds } from "#core/layout.ts";
import { windowBackground } from "#core/shell-grey.ts";

import {
  clickMenuItem,
  expect,
  findPage,
  readViews,
  test,
  writeSettings,
} from "./lib/app.ts";
import { CALENDAR_TITLE, DRAFT_LABEL, STAND_IN_TITLE } from "./lib/stand-in.ts";

const hasMenuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, itemId) =>
      Boolean(Menu.getApplicationMenu()?.getMenuItemById(itemId)),
    id
  );

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

test("the view sits as the shell draws it, on the shell grey the window has too tinted by the profile's colour, whatever design and vibrancy an earlier build saved, which the View menu no longer offers", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, { design: "classic", vibrancy: false });

  const app = await launchApp();

  await findPage(app, standIn.url);

  const shell = await findPage(app, "meru-app:");
  const { area, content, menuBarVisible, views } = await readViews(app);

  // On Windows and Linux the menu bar stays hidden and takes no height.
  expect(menuBarVisible).toBe(process.platform === "darwin");
  expect(area).toStrictEqual(content);
  expect(views.map((view) => view.bounds)).toStrictEqual([
    contentViewBounds(area, "hidden"),
  ]);
  await expect.poll(() => drawnPadding(shell)).toBe("0px 8px 8px");
  // Playwright emulates the light theme in the page, not in main. The first
  // profile's colour is the palette's first.
  const [drawn, tinted] = await shell
    .getByRole("banner", { name: "Title bar" })
    .evaluate((titlebar) => {
      const probe = document.createElement("div");

      probe.style.backgroundColor =
        "color-mix(in oklch, rgb(235, 235, 235), #2d52d2 6%)";
      document.body.append(probe);

      const expected = getComputedStyle(probe).backgroundColor;

      probe.remove();

      return [
        getComputedStyle(titlebar.parentElement ?? titlebar).backgroundColor,
        expected,
      ];
    });

  expect(drawn).toBe(tinted);

  const window = await app.evaluate(({ BrowserWindow, nativeTheme }) => ({
    color: BrowserWindow.getAllWindows()[0]?.getBackgroundColor(),
    isDark: nativeTheme.shouldUseDarkColors,
  }));

  expect(window.color?.toLowerCase()).toBe(windowBackground(window.isDark));
  expect(
    await Promise.all(
      [
        "design.modern",
        "design.classic",
        "vibrancy.toggle",
        "inbox.toggle",
      ].map((id) => hasMenuItem(app, id))
    )
  ).toStrictEqual([false, false, false, true]);
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
