import type { ElectronApplication, Page } from "@playwright/test";

import {
  chooseContextMenuItem,
  clickMenuItem,
  expect,
  findPage,
  openContextMenu,
  readMenuLabel,
  readViews,
  test,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import {
  CALENDAR_TITLE,
  DRIVE_TITLE,
  GMAIL_LINK_HASH,
  NEXT_WEEK_PATH,
  STAND_IN_TITLE,
} from "./lib/stand-in.ts";

/**
 * Gmail, pinned, Drive, pinned with Open at Launch off, and Calendar in the
 * list, selected.
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
            id: "d",
            app: "drive",
            url: standIn.driveUrl,
            title: DRIVE_TITLE,
            pinned: true,
            openAtLaunch: false,
          },
          {
            id: "c",
            app: "calendar",
            url: standIn.calendarUrl,
            title: CALENDAR_TITLE,
          },
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

/** Launches on the seed, with Calendar's and Gmail's pages loaded. */
const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn
) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.url);

  return { app, shell };
};

/** Chooses the item of the tab's context menu. */
const choose = async (
  app: ElectronApplication,
  shell: Page,
  title: string,
  label: string
) => {
  await openContextMenu(app, () =>
    tab(shell, title).click({ button: "right" })
  );
  await chooseContextMenuItem(app, label);
};

/** The page of each content view and whether it shows. */
const readTabViews = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views.map(({ url, visible }) => ({ url, visible }));
};

/** The renderer processes the app runs, the shell's and the overlay's too. */
const countRenderers = (app: ElectronApplication) =>
  app.evaluate(
    ({ app: electronApp }) =>
      electronApp.getAppMetrics().filter((metric) => metric.type === "Tab")
        .length
  );

const sleepingPane = (shell: Page, title: string) =>
  shell.getByRole("region", { name: `${title} is sleeping` });

/**
 * Notes, from now on, whether the sleeping pane is ever drawn, however
 * briefly; `seen` reads it.
 */
const watchForPane = async (shell: Page) => {
  await shell.evaluate(() => {
    Reflect.set(window, "paneSeen", false);
    new MutationObserver(() => {
      if (document.querySelector("[data-sleeping-tab]")) {
        Reflect.set(window, "paneSeen", true);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });

  return () => shell.evaluate(() => Reflect.get(window, "paneSeen"));
};

const focusOnBody = (shell: Page) =>
  shell.evaluate(() => document.activeElement === document.body);

test("selecting a tab that is not loaded, by a click or Enter, loads it without the sleeping pane ever showing, focus staying off the page's body", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);

  await choose(app, shell, STAND_IN_TITLE, "Sleep");
  await expect(tab(shell, STAND_IN_TITLE)).toHaveCSS("opacity", "0.5");

  const seen = await watchForPane(shell);

  // Never loaded: Drive's pinned tile.
  await tab(shell, DRIVE_TITLE).click();
  await findPage(app, standIn.driveUrl);
  await expect(tab(shell, DRIVE_TITLE)).toHaveCSS("opacity", "1");
  await expect(tab(shell, DRIVE_TITLE)).toBeFocused();

  // Put to sleep in the background, then chosen with Enter.
  await tab(shell, STAND_IN_TITLE).focus();
  await tab(shell, STAND_IN_TITLE).press("Enter");
  await expect(tab(shell, STAND_IN_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect
    .poll(() => readTabViews(app))
    .toContainEqual({ url: standIn.url, visible: true });

  // Back to Calendar, loaded, and to the profile's tab after a relayout.
  await tab(shell, CALENDAR_TITLE).click();
  await expect
    .poll(() => readTabViews(app))
    .toContainEqual({ url: standIn.calendarUrl, visible: true });

  expect(await seen()).toBe(false);
  expect(await focusOnBody(shell)).toBe(false);
});

test("Sleep closes a background tab's view and renderer and dims its tile, which says it sleeps, and a click wakes it where it was", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const calendar = await findPage(app, standIn.calendarUrl);

  await calendar.getByRole("link", { name: "Next week" }).click();
  await expect(calendar).toHaveURL(
    new URL(NEXT_WEEK_PATH, standIn.calendarUrl).href
  );
  await tab(shell, STAND_IN_TITLE).click();
  await expect
    .poll(() => readTabViews(app))
    .toStrictEqual([
      { url: standIn.url, visible: true },
      {
        url: new URL(NEXT_WEEK_PATH, standIn.calendarUrl).href,
        visible: false,
      },
    ]);

  const before = await countRenderers(app);

  await choose(app, shell, CALENDAR_TITLE, "Sleep");

  await expect
    .poll(() => readTabViews(app))
    .toStrictEqual([{ url: standIn.url, visible: true }]);
  await expect.poll(() => countRenderers(app)).toBe(before - 1);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveCSS("opacity", "0.5");
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAccessibleDescription(
    /asleep/iu
  );
  await expect(tab(shell, STAND_IN_TITLE)).toHaveCSS("opacity", "1");

  await tab(shell, CALENDAR_TITLE).click();

  await expect
    .poll(() => readTabViews(app))
    .toStrictEqual([
      { url: standIn.url, visible: false },
      { url: new URL(NEXT_WEEK_PATH, standIn.calendarUrl).href, visible: true },
    ]);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveCSS("opacity", "1");
});

test("Sleep on the selected tab keeps it selected, with the sleeping pane in place of its page and focus on Wake, which loads it again where it was", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const calendar = await findPage(app, standIn.calendarUrl);
  const nextWeek = new URL(NEXT_WEEK_PATH, standIn.calendarUrl).href;

  await calendar.getByRole("link", { name: "Next week" }).click();
  await expect(calendar).toHaveURL(nextWeek);
  expect(await readMenuLabel(app, "tab.sleep")).toBe("Sleep Tab");

  await choose(app, shell, CALENDAR_TITLE, "Sleep");

  const pane = sleepingPane(shell, CALENDAR_TITLE);
  const wake = pane.getByRole("button", { name: "Wake" });

  await expect(pane).toBeVisible();
  await expect(wake).toBeFocused();
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(tab(shell, CALENDAR_TITLE)).toHaveCSS("opacity", "0.5");
  await expect
    .poll(() => readTabViews(app))
    .toStrictEqual([{ url: standIn.url, visible: false }]);
  await expect.poll(() => readMenuLabel(app, "tab.sleep")).toBe("Wake Tab");

  await wake.click();

  await expect(pane).toHaveCount(0);
  await expect
    .poll(() => readTabViews(app))
    .toStrictEqual([
      { url: standIn.url, visible: false },
      { url: nextWeek, visible: true },
    ]);

  // The Tabs menu's Sleep Tab does the same, and Reload wakes it, from the
  // menu or the titlebar, where Back and Forward stay disabled.
  await clickMenuItem(app, "tab.sleep");
  await expect(pane).toBeVisible();
  await clickMenuItem(app, "tab.reload");
  await expect(pane).toHaveCount(0);
  await expect
    .poll(() => readTabViews(app))
    .toContainEqual({ url: nextWeek, visible: true });

  const bar = shell.getByRole("banner", { name: "Title bar" });
  const reload = bar.getByRole("button", { name: "Reload" });

  await clickMenuItem(app, "tab.sleep");
  await expect(pane).toBeVisible();
  await expect(reload).toBeEnabled();
  await expect(bar.getByRole("button", { name: "Back" })).toBeDisabled();
  await expect(bar.getByRole("button", { name: "Forward" })).toBeDisabled();
  await reload.click();
  await expect(pane).toHaveCount(0);
  await expect
    .poll(() => readTabViews(app))
    .toStrictEqual([
      { url: standIn.url, visible: false },
      { url: nextWeek, visible: true },
    ]);
});

test("a pinned app with Open at Launch off is drawn asleep until opened, and the pinned shortcut wakes it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const drive = tab(shell, DRIVE_TITLE);

  await expect(drive).toHaveCSS("opacity", "0.5");
  await expect(drive).toHaveAttribute("title", `${DRIVE_TITLE} · asleep`);

  await app.evaluate(({ webContents }, url) => {
    const page = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith(url));

    for (const type of ["keyDown", "keyUp"] as const) {
      page?.sendInputEvent({
        type,
        keyCode: "2",
        modifiers: ["control", "shift"],
      });
    }
  }, standIn.calendarUrl);

  await findPage(app, standIn.driveUrl);
  await expect(drive).toHaveAttribute("aria-selected", "true");
  await expect(drive).toHaveCSS("opacity", "1");
  await expect(drive).toHaveAttribute("title", DRIVE_TITLE);
});

test("a link to a sleeping tab's app wakes it at the link, selected", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);

  await choose(app, shell, STAND_IN_TITLE, "Sleep");
  await expect(tab(shell, STAND_IN_TITLE)).toHaveCSS("opacity", "0.5");

  const calendar = await findPage(app, standIn.calendarUrl);

  await calendar.getByRole("link", { name: "Open Gmail" }).click();

  await expect(tab(shell, STAND_IN_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(tab(shell, STAND_IN_TITLE)).toHaveCSS("opacity", "1");
  await expect
    .poll(() => readTabViews(app))
    .toStrictEqual([
      { url: standIn.calendarUrl, visible: false },
      { url: `${standIn.url}${GMAIL_LINK_HASH}`, visible: true },
    ]);
});
