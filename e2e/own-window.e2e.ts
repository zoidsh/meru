import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

import { FIND_INSET } from "#core/find.ts";
import {
  OWN_WINDOW_DOWNLOADS_FRAME_PREFIX,
  OWN_WINDOW_FIND_FRAME_PREFIX,
} from "#core/own-window.ts";

import {
  clickMenuItem,
  readMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readState,
  readUnreadTotal,
  readViews,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import {
  findTitlebar,
  findWindowDownloads,
  findWindowFind,
  readOwnWindows,
} from "./lib/own-window.ts";
import { openSettings, removeProfileInSettings } from "./lib/settings.ts";
import type { StandIn } from "./lib/stand-in.ts";
import {
  ANY_SESSION,
  CALENDAR_TITLE,
  DRIVE_TITLE,
  FIND_MATCHES,
  FIND_WORD,
  POPOUT_PATH,
  POPOUT_TITLE,
  STAND_IN_TITLE,
  listing,
  message,
  messageLink,
} from "./lib/stand-in.ts";

const isMacOS = process.platform === "darwin";

interface StoredTab {
  id: string;
  ownWindow?: unknown;
  windowBounds?: unknown;
}

/**
 * Gmail, Calendar, selected, and Drive, with `fields` added to the profile
 * and `gmail` to Gmail's tab.
 */
const seed = (
  userDataDir: string,
  standIn: StandIn,
  fields: object = {},
  gmail: object = {}
) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "", ...gmail },
          { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
          { id: "d", app: "drive", url: standIn.driveUrl, title: "" },
        ],
        selectedTabId: "c",
        ...fields,
      },
    ],
    selectedProfileId: "p",
  });

const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn
) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const calendar = await findPage(app, standIn.calendarUrl);

  return { app, shell, calendar };
};

/** The page in the one own window, or none. */
const ownWindowPage = async (app: ElectronApplication) => {
  const [window] = await readOwnWindows(app);

  return window?.views.find((view) => view.name === "")?.url;
};

/**
 * Cmd or Ctrl with `keyCode`, and Shift with `shift`, in the page whose URL
 * or document whose name starts with `target`, as the system hands keys to
 * it, so its view hears them first; `plain` leaves out Cmd or Ctrl.
 */
const press = (
  app: ElectronApplication,
  target: string,
  keyCode: string,
  { shift = false, plain = false } = {}
) =>
  app.evaluate(
    ({ webContents }, request) => {
      const page = webContents
        .getAllWebContents()
        .find(
          (candidate) =>
            candidate.getURL().startsWith(request.target) ||
            candidate.mainFrame.name.startsWith(request.target)
        );

      for (const type of ["keyDown", "keyUp"] as const) {
        page?.sendInputEvent({
          type,
          keyCode: request.keyCode,
          modifiers: request.modifiers,
        });
      }
    },
    {
      target,
      keyCode,
      modifiers: [
        ...(plain ? [] : [isMacOS ? ("meta" as const) : ("control" as const)]),
        ...(shift ? (["shift"] as const) : []),
      ],
    }
  );

const pressShifted = (
  app: ElectronApplication,
  target: string,
  keyCode: string
) => press(app, target, keyCode, { shift: true });

/**
 * Lets `document.hasFocus()` in the page say whether it holds Chromium's
 * keyboard focus, which Playwright otherwise makes every page claim.
 */
const followRealFocus = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });

  return () => page.evaluate(() => document.hasFocus()).catch(() => false);
};

const zoomOf = (app: ElectronApplication, url: string) =>
  app.evaluate(
    ({ webContents }, wanted) =>
      webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(wanted))
        ?.getZoomLevel(),
    url
  );

/**
 * The own window's find bar view, last over its page, and where it goes:
 * `FIND_INSET` in from the page's top right, as their top right corners.
 */
const ownWindowFindPlace = async (app: ElectronApplication) => {
  const [window] = await readOwnWindows(app);
  const views = window?.views ?? [];
  const page = views.find((view) => view.name === "")?.bounds;
  const last = views.at(-1);

  return {
    last: last?.name.startsWith(OWN_WINDOW_FIND_FRAME_PREFIX),
    bar: last && {
      right: last.bounds.x + last.bounds.width,
      top: last.bounds.y,
    },
    goes: page && {
      right: page.x + page.width - FIND_INSET,
      top: page.y + FIND_INSET,
    },
  };
};

/** Whether the main window's overlay view shows. */
const overlayShown = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((window) =>
      window.contentView.children.some(
        (view) =>
          (view as Electron.WebContentsView).webContents?.mainFrame.name ===
            "meru-overlay" && view.getVisible()
      )
    )
  );

/** Whether the own window has a find bar view. */
const ownWindowFindOpen = async (app: ElectronApplication) => {
  const [window] = await readOwnWindows(app);

  return (
    window?.views.some((view) =>
      view.name.startsWith(OWN_WINDOW_FIND_FRAME_PREFIX)
    ) ?? false
  );
};

/** Whether the own window has a Downloads card view. */
const ownWindowCardOpen = async (app: ElectronApplication) => {
  const [window] = await readOwnWindows(app);

  return (
    window?.views.some((view) =>
      view.name.startsWith(OWN_WINDOW_DOWNLOADS_FRAME_PREFIX)
    ) ?? false
  );
};

const findParts = (document: Page) => {
  const bar = document.getByRole("search", { name: "Find in page" });

  return {
    bar,
    field: bar.getByRole("textbox", { name: "Find in page" }),
    count: bar.getByText(/^\d+\/\d+$/u),
  };
};

const menuEnabled = async (app: ElectronApplication, id: string) => {
  const { enabled } = await readMenuItem(app, id);

  return enabled;
};

const tab = (shell: Page, title: string) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab", {
    name: title,
    exact: true,
  });

const storedTab = async (userDataDir: string, tabId: string) => {
  const { profiles } = await readState<{
    profiles: { tabs: StoredTab[]; selectedTabId: string }[];
  }>(userDataDir);

  return profiles[0]?.tabs.find((each) => each.id === tabId);
};

/** A tab's field as stored, the Calendar tab's unless named. */
const storedField = async (
  userDataDir: string,
  field: "ownWindow" | "windowBounds",
  tabId = "c"
) => {
  const stored = await storedTab(userDataDir, tabId);

  return stored?.[field];
};

const ownWindowCount = async (app: ElectronApplication) => {
  const windows = await readOwnWindows(app);

  return windows.length;
};

const firstWindowBounds = async (app: ElectronApplication) => {
  const [window] = await readOwnWindows(app);

  return window?.bounds;
};

/**
 * The shell's page loaded again after its process died, and what closes
 * the connection reaching it. Playwright holds a page whose process crashed
 * as crashed for good, though Chromium loads it again in the same target, so
 * it is reached over a connection of its own, made once main has it loaded:
 * one made while it is still gone holds it crashed in turn.
 */
const reachShell = async (app: ElectronApplication, userDataDir: string) => {
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) => {
        const shell = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL().startsWith("meru-app:"));

        return shell && !shell.isCrashed() && !shell.isLoading()
          ? shell.executeJavaScript("document.readyState").catch(() => "gone")
          : "gone";
      })
    )
    .toBe("complete");

  // Chromium writes the port it picked there, the suite asking for any.
  const active = await readFile(
    path.join(userDataDir, "DevToolsActivePort"),
    "utf-8"
  );
  const [port] = active.split("\n");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let found: Page | undefined;

  await expect
    .poll(() => {
      found = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().startsWith("meru-app:"));

      return found?.evaluate(() => document.readyState).catch(() => "gone");
    })
    .toBe("complete");

  return {
    page: found as Page,
    close: () => browser.close(),
  };
};

/** Kills the shell's renderer, as a crash does. */
const crashShell = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith("meru-app:"))
      ?.forcefullyCrashRenderer();
  });

/** A mark the page keeps only while it is not loaded again. */
const mark = (page: Page) =>
  page.evaluate(() => {
    Reflect.set(window, "meruMark", 42);
  });

/** The mark, or none while the page is loading again. */
const marked = (page: Page) =>
  page
    .evaluate(() => Reflect.get(window, "meruMark") as unknown)
    .catch(() => null);

/** The titles of the notifications the suite's build captured in place of showing. */
const notified = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestNotifications") as { title: string }[]
    ).map(({ title }) => title)
  );

/** Asks a window to close, as its close button does: the main one or the tab's own. */
const closeWindow = (app: ElectronApplication, which: "main" | "own") =>
  app.evaluate(({ BaseWindow, BrowserWindow }, wanted) => {
    setTimeout(() => {
      BaseWindow.getAllWindows()
        .find((window) =>
          wanted === "main"
            ? window instanceof BrowserWindow &&
              window.webContents.getURL().startsWith("meru-app:")
            : !(window instanceof BrowserWindow)
        )
        ?.close();
    }, 0);
  }, which);

const mainWindowVisible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (window) =>
        window.webContents.getURL().startsWith("meru-app:") &&
        window.isVisible()
    )
  );

/** Whether any web contents still shows a page under `url`. */
const pageOpen = (app: ElectronApplication, url: string) =>
  app.evaluate(
    ({ webContents }, wanted) =>
      webContents
        .getAllWebContents()
        .some((contents) => contents.getURL().startsWith(wanted)),
    url
  );

test("Move to New Window puts the selected tab's page in a window of its own as it was, marks its tab and selects the next; the shell's renderer dying, the shell comes back with its sidebar, its titlebar, the window's titlebar and both find bars with their words and counts, the window's taking the keys again, no card left open, the pages not loaded again", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, calendar } = await launch(
    launchApp,
    userDataDir,
    standIn
  );

  await mark(calendar);

  const loads = standIn.requests().calendar;

  await clickMenuItem(app, "tab.moveToNewWindow");

  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());
  expect(await marked(calendar)).toBe(42);
  expect(standIn.requests().calendar).toBe(loads);

  const [window] = await readOwnWindows(app);
  const page = window?.views.find((view) => view.name === "");

  expect(window?.visible).toBeTruthy();
  expect(page?.visible).toBeTruthy();
  expect(page?.bounds).toMatchObject({ x: 8, y: 40 });

  // Gone from the main window, whose selection went where closing would send it.
  const { views } = await readViews(app);

  expect(views.some((view) => view.url === calendar.url())).toBeFalsy();
  await expect(tab(shell, DRIVE_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAccessibleDescription(
    `${CALENDAR_TITLE} · in its own window`
  );
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "title",
    `${CALENDAR_TITLE} · in its own window`
  );
  await expect.poll(() => storedField(userDataDir, "ownWindow")).toBe(true);

  const titlebar = await findTitlebar(app);
  const header = titlebar.getByRole("banner", { name: "Title bar" });

  await expect(header.getByText(CALENDAR_TITLE)).toBeVisible();
  await expect(header.getByRole("button", { name: /^Reload/u })).toBeEnabled();
  // One profile has no badge.
  await expect(header.getByText("Default")).toHaveCount(0);

  // The shell's renderer dying with the window's find bar holding the keys,
  // the shell comes back in a new one with its sidebar, titlebar and the
  // window's titlebar and bar, which takes the keys again, and the pages, in
  // processes of their own, stay as they were.
  const drive = await findPage(app, standIn.driveUrl);

  await mark(drive);
  await press(app, standIn.calendarUrl, "F");

  const windowFind = findParts(await findWindowFind(app));

  await expect(windowFind.field).toBeFocused();
  await windowFind.field.pressSequentially(FIND_WORD);
  await expect(windowFind.count).toHaveText(`1/${FIND_MATCHES}`);

  const { calendar: calendarLoads, drive: driveLoads } = standIn.requests();
  const oldOverlay = await findOverlayDocument(app);

  await crashShell(app);

  const first = await reachShell(app, userDataDir);

  await expect(tab(first.page, DRIVE_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(
    first.page.getByRole("banner", { name: "Title bar" })
  ).toBeVisible();
  await expect(tab(first.page, CALENDAR_TITLE)).toHaveAccessibleDescription(
    `${CALENDAR_TITLE} · in its own window`
  );

  const newTitlebar = await findTitlebar(app);

  await expect(
    newTitlebar
      .getByRole("banner", { name: "Title bar" })
      .getByText(CALENDAR_TITLE)
  ).toBeVisible();
  expect(titlebar.isClosed()).toBeTruthy();
  expect(oldOverlay.isClosed()).toBeTruthy();

  const backDocument = await findWindowFind(app);
  const backHasFocus = await followRealFocus(backDocument);
  const back = findParts(backDocument);

  await expect(back.field).toHaveValue(FIND_WORD);
  await expect(back.count).toHaveText(`1/${FIND_MATCHES}`);
  await expect(back.field).toBeFocused();
  await expect.poll(backHasFocus).toBeTruthy();
  expect(await ownWindowPage(app)).toBe(calendar.url());
  expect(await marked(calendar)).toBe(42);
  expect(await marked(drive)).toBe(42);
  expect(standIn.requests()).toMatchObject({
    calendar: calendarLoads,
    drive: driveLoads,
  });

  // Dying again with the main window's find bar open under New tab's card,
  // the card is gone and stays gone, main knowing it, and the bar, which
  // main keeps, is back with its word and count. A card closed gives the
  // keys to the main window's front page, so Find opens its bar there.
  const firstNewTab = first.page.getByRole("button", { name: "New tab" });
  const firstOverlay = await findOverlayDocument(app);
  const firstFind = findParts(firstOverlay);

  await firstNewTab.click();
  await firstOverlay.keyboard.press("Escape");
  await expect.poll(() => menuEnabled(app, "tab.moveToNewWindow")).toBeTruthy();
  await clickMenuItem(app, "tab.find");
  await firstFind.field.pressSequentially("stand-in");
  await expect(firstFind.count).toHaveText(/^1\/\d+$/u);

  const counted = (await firstFind.count.textContent()) ?? "";

  await firstNewTab.click();
  await expect(
    firstOverlay.getByRole("dialog", { name: "New tab" })
  ).toBeVisible();
  await expect(firstNewTab).toHaveAttribute("aria-pressed", "true");
  await first.close();
  await crashShell(app);

  const second = await reachShell(app, userDataDir);
  const newTab = second.page.getByRole("button", { name: "New tab" });
  const overlay = await findOverlayDocument(app);
  const card = overlay.getByRole("dialog", { name: "New tab" });
  const { field, count } = findParts(overlay);

  await expect(field).toHaveValue("stand-in");
  await expect(count).toHaveText(counted);
  await expect(newTab).toHaveAttribute("aria-pressed", "false");
  await expect(card).toHaveCount(0);
  await newTab.click();
  await expect(card).toBeVisible();
  await overlay.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(count).toHaveText(counted);
  await second.close();
});

test("Cmd or Ctrl+Shift+N in the page moves it; a click on its tab focuses that page and selects nothing; Cmd or Ctrl+Shift+M there moves it back, selected", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, calendar } = await launch(
    launchApp,
    userDataDir,
    standIn
  );

  await mark(calendar);
  await pressShifted(app, standIn.calendarUrl, "N");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());

  // The suite's app is never active, so no window of it is the key one, and
  // the page's focus shows in the commands that now act on its window: the
  // moved page has it at once, and keeps it as its tab is clicked.
  await expect
    .poll(() => menuEnabled(app, "tab.moveToMainWindow"))
    .toBeTruthy();
  await tab(shell, CALENDAR_TITLE).click();
  await expect
    .poll(() => menuEnabled(app, "tab.moveToMainWindow"))
    .toBeTruthy();
  expect(await menuEnabled(app, "tab.moveToNewWindow")).toBeFalsy();
  await expect(tab(shell, DRIVE_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await pressShifted(app, standIn.calendarUrl, "M");
  await expect.poll(() => ownWindowCount(app)).toBe(0);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect
    .poll(async () => {
      const { views } = await readViews(app);

      return views.find((view) => view.url === calendar.url())?.visible;
    })
    .toBeTruthy();
  expect(await marked(calendar)).toBe(42);
});

test("Cmd or Ctrl+F in a tab's own window opens its find bar over that page's top right; it counts, steps, zooms the page, and Escape gives the focus back to that page, the main window staying behind", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, calendar } = await launch(
    launchApp,
    userDataDir,
    standIn
  );
  const calendarHasFocus = await followRealFocus(calendar);
  const shellHasFocus = await followRealFocus(shell);

  await pressShifted(app, standIn.calendarUrl, "N");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());
  await expect.poll(calendarHasFocus).toBeTruthy();

  await press(app, standIn.calendarUrl, "F");

  const document = await findWindowFind(app);
  const findHasFocus = await followRealFocus(document);
  const { field, count } = findParts(document);

  await expect(field).toBeFocused();
  await expect.poll(findHasFocus).toBeTruthy();
  await expect
    .poll(async () => {
      const { last, bar: corner, goes } = await ownWindowFindPlace(app);

      return (
        last === true &&
        corner !== undefined &&
        goes !== undefined &&
        Math.abs(corner.right - goes.right) <= 4 &&
        Math.abs(corner.top - goes.top) <= 4
      );
    })
    .toBe(true);
  await expect(count).toHaveText("0/0");
  // The main window's overlay shows no bar of its own.
  expect(await overlayShown(app)).toBeFalsy();

  await field.pressSequentially(FIND_WORD);
  await expect(count).toHaveText(`1/${FIND_MATCHES}`);
  await field.press("Enter");
  await expect(count).toHaveText(`2/${FIND_MATCHES}`);
  await field.press("Shift+Enter");
  await expect(count).toHaveText(`1/${FIND_MATCHES}`);
  await press(app, OWN_WINDOW_FIND_FRAME_PREFIX, "G");
  await expect(count).toHaveText(`2/${FIND_MATCHES}`);

  await press(app, OWN_WINDOW_FIND_FRAME_PREFIX, "=");
  await expect.poll(() => zoomOf(app, standIn.calendarUrl)).toBe(0.5);
  await press(app, OWN_WINDOW_FIND_FRAME_PREFIX, "0");
  await expect.poll(() => zoomOf(app, standIn.calendarUrl)).toBe(0);
  await expect(field).toBeFocused();

  await press(app, OWN_WINDOW_FIND_FRAME_PREFIX, "Escape", { plain: true });
  await expect.poll(() => ownWindowFindOpen(app)).toBe(false);
  await expect.poll(() => document.isClosed()).toBe(true);
  await expect.poll(calendarHasFocus).toBeTruthy();
  expect(await shellHasFocus()).toBeFalsy();
  expect(await menuEnabled(app, "tab.moveToMainWindow")).toBeTruthy();
  expect(await ownWindowCount(app)).toBe(1);

  // Opened again, the bar keeps its term, as the main window's does.
  await press(app, standIn.calendarUrl, "F");

  const again = findParts(await findWindowFind(app));

  await expect(again.field).toHaveValue(FIND_WORD);
  await expect(again.field).toBeFocused();
});

/** Tells the tab's own window it came forward, as the system would. */
const ownWindowComesForward = (app: ElectronApplication) =>
  app.evaluate(({ BaseWindow, BrowserWindow }) => {
    BaseWindow.getAllWindows()
      .find((window) => !(window instanceof BrowserWindow))
      ?.emit("focus");
  });

/** Gives the page under `url` focus, as a click in it would. */
const focusPage = (app: ElectronApplication, url: string) =>
  app.evaluate(({ webContents }, wanted) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith(wanted))
      ?.focus();
  }, url);

test("the tab's own window coming forward gives the keys to its find bar while that is open, else to its page", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, calendar } = await launch(launchApp, userDataDir, standIn);
  const calendarHasFocus = await followRealFocus(calendar);

  await pressShifted(app, standIn.calendarUrl, "N");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());
  await press(app, standIn.calendarUrl, "F");

  const document = await findWindowFind(app);
  const findHasFocus = await followRealFocus(document);

  await expect.poll(findHasFocus).toBeTruthy();

  // A click on the page, then the window left and come back to.
  await focusPage(app, standIn.calendarUrl);
  await expect.poll(calendarHasFocus).toBeTruthy();
  await ownWindowComesForward(app);
  await expect.poll(findHasFocus).toBeTruthy();
  expect(await calendarHasFocus()).toBeFalsy();

  await press(app, OWN_WINDOW_FIND_FRAME_PREFIX, "Escape", { plain: true });
  await expect.poll(() => ownWindowFindOpen(app)).toBe(false);
  await expect.poll(calendarHasFocus).toBeTruthy();
  await ownWindowComesForward(app);
  await expect.poll(calendarHasFocus).toBeTruthy();
});

test("closing the window by its control or putting its profile to sleep with its find bar open closes the bar's document with it, the shell erring nowhere", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
        selectedTabId: "gmail",
      },
      {
        id: "q",
        name: "Work",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          {
            id: "c",
            app: "calendar",
            url: standIn.calendarUrl,
            title: "",
            ownWindow: true,
          },
          {
            id: "d",
            app: "drive",
            url: standIn.driveUrl,
            title: "",
            ownWindow: true,
          },
        ],
        selectedTabId: "gmail",
      },
    ],
    selectedProfileId: "q",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const errors: string[] = [];

  shell.on("pageerror", (error) => errors.push(error.message));
  await expect.poll(() => ownWindowCount(app)).toBe(2);

  /** Opens the find bar in the first own window, its tab clicked first. */
  const openFind = async () => {
    await shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { name: CALENDAR_TITLE, exact: true })
      .click();
    await press(app, standIn.calendarUrl, "F");

    const document = await findWindowFind(app);

    document.on("pageerror", (error) => errors.push(error.message));
    await expect(findParts(document).field).toBeFocused();

    return document;
  };

  const first = await openFind();

  // Calendar's window, as its close button asks it, Drive's staying.
  await app.evaluate(({ BaseWindow, BrowserWindow }, prefix) => {
    setTimeout(() => {
      BaseWindow.getAllWindows()
        .find(
          (window) =>
            !(window instanceof BrowserWindow) &&
            window.contentView.children.some((view) =>
              (
                view as Electron.WebContentsView
              ).webContents.mainFrame.name.startsWith(prefix)
            )
        )
        ?.close();
    }, 0);
  }, OWN_WINDOW_FIND_FRAME_PREFIX);
  await expect.poll(() => ownWindowCount(app)).toBe(1);
  await expect.poll(() => first.isClosed()).toBe(true);
  await expect(
    shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { name: CALENDAR_TITLE, exact: true })
  ).toHaveCount(0);

  // Drive's window, its bar open, goes as its profile sleeps.
  await shell
    .getByRole("tablist", { name: "Tabs" })
    .getByRole("tab", { name: DRIVE_TITLE, exact: true })
    .click();
  await press(app, standIn.driveUrl, "F");

  const second = await findWindowFind(app);

  second.on("pageerror", (error) => errors.push(error.message));
  await expect(findParts(second).field).toBeFocused();

  // Focus back in the main window, where Sleep Profile is offered.
  await shell
    .getByRole("tablist", { name: "Tabs" })
    .getByRole("tab")
    .first()
    .click();
  await clickMenuItem(app, "profile.sleep");
  await expect.poll(() => ownWindowCount(app)).toBe(0);
  await expect.poll(() => second.isClosed()).toBe(true);
  await expect
    .poll(() =>
      app.evaluate(
        ({ webContents }, prefix) =>
          webContents
            .getAllWebContents()
            .some((contents) => contents.mainFrame.name.startsWith(prefix)),
        OWN_WINDOW_FIND_FRAME_PREFIX
      )
    )
    .toBe(false);
  expect(errors).toStrictEqual([]);
});

const cycle = async (open: () => Promise<void>, close: () => Promise<void>) => {
  await open();
  await close();
};

/**
 * How many documents the shell's renderer holds once its garbage is
 * collected, its own and every one it opened that is still referenced.
 */
const shellDocuments = async (shell: Page) => {
  const cdp = await shell.context().newCDPSession(shell);

  await cdp.send("HeapProfiler.collectGarbage");

  const { documents } = await cdp.send("Memory.getDOMCounters");

  await cdp.detach();

  return documents;
};

test("the shell's renderer lets go of the documents of find bars, Downloads cards and titlebars closed, over thirty rounds of each", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  test.setTimeout(180_000);

  const { app, shell, calendar } = await launch(
    launchApp,
    userDataDir,
    standIn
  );

  await pressShifted(app, standIn.calendarUrl, "N");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());

  const findOpen = async () => {
    await press(app, standIn.calendarUrl, "F");
    // Its keys are heard once the shell has drawn it.
    await expect(findParts(await findWindowFind(app)).field).toBeFocused();
  };
  const findClose = async () => {
    await press(app, OWN_WINDOW_FIND_FRAME_PREFIX, "Escape", { plain: true });
    await expect.poll(() => ownWindowFindOpen(app)).toBe(false);
  };

  // Once first, so what opening one leaves for good is in the count.
  await cycle(findOpen, findClose);

  const beforeFind = await shellDocuments(shell);

  for (let round = 0; round < 30; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one round after another
    await cycle(findOpen, findClose);
  }

  const afterFind = await shellDocuments(shell);

  const titlebar = await findTitlebar(app);
  const downloads = titlebar.getByRole("button", {
    name: "Downloads",
    exact: true,
  });
  const cardOpen = async () => {
    await downloads.click();
    await findWindowDownloads(app);
  };
  const cardClose = async () => {
    await downloads.click();
    await expect.poll(() => ownWindowCardOpen(app)).toBe(false);
  };

  await cycle(cardOpen, cardClose);

  const beforeCard = await shellDocuments(shell);

  for (let round = 0; round < 30; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one round after another
    await cycle(cardOpen, cardClose);
  }

  const afterCard = await shellDocuments(shell);

  const windowOpen = async () => {
    await pressShifted(app, standIn.calendarUrl, "N");
    await expect.poll(() => ownWindowCount(app)).toBe(1);
  };
  const windowClose = async () => {
    await pressShifted(app, standIn.calendarUrl, "M");
    await expect.poll(() => ownWindowCount(app)).toBe(0);
  };

  await windowClose();

  const beforeWindows = await shellDocuments(shell);

  for (let round = 0; round < 30; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one round after another
    await cycle(windowOpen, windowClose);
  }

  const afterWindows = await shellDocuments(shell);

  console.log(
    `shell documents: find ${beforeFind} -> ${afterFind}, card ${beforeCard} -> ${afterCard}, windows ${beforeWindows} -> ${afterWindows}`
  );
  expect([afterFind, afterCard, afterWindows]).toStrictEqual([
    beforeFind,
    beforeCard,
    beforeWindows,
  ]);
});

test("moving a tab back to the main window with its find bar open closes the bar with its document; the main window opens none", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, calendar } = await launch(
    launchApp,
    userDataDir,
    standIn
  );

  await pressShifted(app, standIn.calendarUrl, "N");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());
  await press(app, standIn.calendarUrl, "F");

  const { field, count } = findParts(await findWindowFind(app));

  await field.pressSequentially(FIND_WORD);
  await expect(count).toHaveText(`1/${FIND_MATCHES}`);

  await pressShifted(app, OWN_WINDOW_FIND_FRAME_PREFIX, "M");
  await expect.poll(() => ownWindowCount(app)).toBe(0);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  expect(await overlayShown(app)).toBeFalsy();
  expect(
    await app.evaluate(
      ({ webContents }, prefix) =>
        webContents
          .getAllWebContents()
          .some((contents) => contents.mainFrame.name.startsWith(prefix)),
      OWN_WINDOW_FIND_FRAME_PREFIX
    )
  ).toBeFalsy();
});

test("closing the window by its control closes its tab, as Close Tab does, the main window's selection kept", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);

  await clickMenuItem(app, "tab.moveToNewWindow");
  await expect.poll(() => ownWindowPage(app)).toBe(standIn.calendarUrl);
  await closeWindow(app, "own");

  await expect.poll(() => ownWindowCount(app)).toBe(0);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveCount(0);
  await expect(tab(shell, DRIVE_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect.poll(() => storedTab(userDataDir, "c")).toBeUndefined();
  await expect.poll(() => pageOpen(app, standIn.calendarUrl)).toBeFalsy();
});

test("Back and Reload in the window's titlebar act on its page", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, calendar } = await launch(launchApp, userDataDir, standIn);

  await clickMenuItem(app, "tab.moveToNewWindow");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());

  const first = calendar.url();

  await calendar.evaluate(() => {
    history.pushState(null, "", "/moved");
  });

  const titlebar = await findTitlebar(app);
  const header = titlebar.getByRole("banner", { name: "Title bar" });
  const back = header.getByRole("button", { name: /^Back/u });

  await expect(back).toBeEnabled();
  await back.click();
  await expect.poll(() => calendar.url()).toBe(first);

  await mark(calendar);

  const loads = standIn.requests().calendar;

  await header.getByRole("button", { name: /^Reload/u }).click();
  await expect.poll(() => standIn.requests().calendar).toBe(loads + 1);
  await expect.poll(() => marked(calendar)).toBeUndefined();
});

test("a restart opens the window again where it was, without taking the foreground", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, calendar } = await launch(launchApp, userDataDir, standIn);
  const bounds = { x: 120, y: 140, width: 820, height: 560 };

  await clickMenuItem(app, "tab.moveToNewWindow");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());
  await app.evaluate(({ BaseWindow, BrowserWindow }, next) => {
    BaseWindow.getAllWindows()
      .find((window) => !(window instanceof BrowserWindow))
      ?.setBounds(next);
  }, bounds);
  await expect
    .poll(() => storedField(userDataDir, "windowBounds"))
    .toMatchObject({ width: bounds.width, height: bounds.height });

  const stored = await storedField(userDataDir, "windowBounds");

  await app.close();

  const again = await launchApp();

  await findPage(again, standIn.calendarUrl);
  await expect.poll(() => firstWindowBounds(again)).toStrictEqual(stored);
  expect(await ownWindowPage(again)).toBe(standIn.calendarUrl);
  await findTitlebar(again);
});

test("Gmail, unpinned, moves to its own window and goes on counting and notifying its mail and opening and closing its pop-outs", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(
    userDataDir,
    standIn,
    { selectedTabId: "gmail" },
    { pinned: false }
  );
  standIn.setFeed(ANY_SESSION, listing("1"));

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const gmail = await findPage(app, standIn.url);

  await expect.poll(() => readUnreadTotal(app)).toBe(1);
  await clickMenuItem(app, "tab.moveToNewWindow");
  await expect.poll(() => ownWindowPage(app)).toBe(gmail.url());
  await expect
    .poll(() => storedField(userDataDir, "ownWindow", "gmail"))
    .toBe(true);
  await expect(
    shell.getByRole("tab", { name: STAND_IN_TITLE, exact: true })
  ).toHaveAttribute("title", `${STAND_IN_TITLE} · in its own window`);

  standIn.setFeed(ANY_SESSION, {
    unreadCount: 2,
    mail: [message("2"), message("1")],
  });
  await app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });
  await expect.poll(() => readUnreadTotal(app)).toBe(2);
  await expect.poll(() => notified(app)).toContain("Sender 2");

  // New tab's card takes the focus into the main window; then the
  // notification's click opens the message in Gmail's own window and gives
  // that window the focus, the main window keeping its tab.
  await clickMenuItem(app, "app.open");
  await expect.poll(() => menuEnabled(app, "tab.moveToMainWindow")).toBeFalsy();
  await app.evaluate((_electron, title) => {
    (
      Reflect.get(globalThis, "meruTestNotifications") as {
        title: string;
        click: () => void;
      }[]
    )
      .find((notification) => notification.title === title)
      ?.click();
  }, "Sender 2");
  await expect.poll(() => gmail.url()).toBe(messageLink(standIn.url, "2"));
  await expect
    .poll(() => menuEnabled(app, "tab.moveToMainWindow"))
    .toBeTruthy();
  expect(await ownWindowPage(app)).toBe(gmail.url());
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect
    .poll(async () => {
      const { profiles } = await readState<{
        profiles: { selectedTabId: string }[];
      }>(userDataDir);

      return profiles[0]?.selectedTabId;
    })
    .toBe("c");

  const popoutUrl = `${standIn.url}${POPOUT_PATH.slice(1)}`;

  await gmail.getByRole("button", { name: "Pop out compose" }).click();

  const popout = await findPage(app, popoutUrl);

  await expect(
    popout.getByRole("heading", { name: POPOUT_TITLE })
  ).toBeVisible();
  // The click closes its own page, which Playwright can report as a failed click.
  await popout
    .getByRole("button", { name: "Send" })
    .click()
    .catch(() => null);
  await expect.poll(() => popout.isClosed()).toBeTruthy();
  expect(await ownWindowPage(app)).toBe(gmail.url());
});

test("with the tray off on Windows and Linux, closing the main window quits Meru, the tab staying in its own window for the next launch", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  test.skip(isMacOS, "On macOS closing the main window hides it");
  await writeSettings(userDataDir, { tray: false });

  const { app, calendar } = await launch(launchApp, userDataDir, standIn);
  const closed = app.waitForEvent("close");

  await clickMenuItem(app, "tab.moveToNewWindow");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());
  await expect.poll(() => storedField(userDataDir, "ownWindow")).toBe(true);
  await closeWindow(app, "main");
  await closed;

  expect(await storedField(userDataDir, "ownWindow")).toBe(true);
});

test("on macOS closing the main window hides it, the tab's own window still closes by its control, closing its tab, and Move to Main Window shows the main window again", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  test.skip(!isMacOS, "Elsewhere closing the main window can quit");

  const { app, calendar } = await launch(launchApp, userDataDir, standIn);

  await clickMenuItem(app, "tab.moveToNewWindow");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());
  await closeWindow(app, "main");
  await expect.poll(() => mainWindowVisible(app)).toBeFalsy();

  await closeWindow(app, "own");
  await expect.poll(() => ownWindowCount(app)).toBe(0);
  await expect.poll(() => storedTab(userDataDir, "c")).toBeUndefined();
  expect(await mainWindowVisible(app)).toBeFalsy();

  // Calendar closed with its window, so Drive, selected, is the one to move.
  await clickMenuItem(app, "tab.moveToNewWindow");
  await expect.poll(() => ownWindowPage(app)).toBe(standIn.driveUrl);
  await clickMenuItem(app, "tab.moveToMainWindow");
  await expect.poll(() => mainWindowVisible(app)).toBeTruthy();
  await expect.poll(() => ownWindowCount(app)).toBe(0);
});

test("a page that crashed in its own window says so there, and reloads on the control", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, calendar } = await launch(launchApp, userDataDir, standIn);

  await clickMenuItem(app, "tab.moveToNewWindow");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());

  const titlebar = await findTitlebar(app);
  const loads = standIn.requests().calendar;

  await app.evaluate(({ webContents }, url) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith(url))
      ?.forcefullyCrashRenderer();
  }, standIn.calendarUrl);

  const heading = titlebar.getByRole("heading", {
    name: "Calendar stopped working",
  });

  await expect(heading).toBeVisible();
  // The panel's, not the titlebar's.
  await titlebar
    .getByRole("region", { name: "Calendar stopped working" })
    .getByRole("button", { name: "Reload" })
    .click();
  await expect(heading).toBeHidden();
  await expect.poll(() => standIn.requests().calendar).toBe(loads + 1);
  expect(await ownWindowCount(app)).toBe(1);
});

test("removing a profile closes its tabs' own windows with their pages", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
        selectedTabId: "gmail",
      },
      {
        id: "q",
        name: "Work",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          {
            id: "c",
            app: "calendar",
            url: standIn.calendarUrl,
            title: "",
            ownWindow: true,
          },
        ],
        selectedTabId: "gmail",
      },
    ],
    selectedProfileId: "q",
  });

  const app = await launchApp();

  await findPage(app, standIn.calendarUrl);
  await expect.poll(() => ownWindowPage(app)).toBe(standIn.calendarUrl);

  // Stands in for the native confirmation, which would show on the desktop.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (() =>
      Promise.resolve({
        response: 0,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox;
  });
  await removeProfileInSettings(await openSettings(app), "Work");

  await expect.poll(() => ownWindowCount(app)).toBe(0);
  await expect.poll(() => pageOpen(app, standIn.calendarUrl)).toBeFalsy();

  const { profiles } = await readState<{ profiles: { id: string }[] }>(
    userDataDir
  );

  expect(profiles.map((profile) => profile.id)).toStrictEqual(["p"]);
});
