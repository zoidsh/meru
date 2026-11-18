import type { ElectronApplication, Page } from "@playwright/test";

import {
  clickMenuItem,
  readMenuItem,
  expect,
  findPage,
  readState,
  readUnreadTotal,
  readViews,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { findTitlebar, readOwnWindows } from "./lib/own-window.ts";
import type { StandIn } from "./lib/stand-in.ts";
import {
  ANY_SESSION,
  CALENDAR_TITLE,
  DRIVE_TITLE,
  POPOUT_PATH,
  POPOUT_TITLE,
  STAND_IN_TITLE,
  listing,
  message,
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
 * Cmd or Ctrl, and Shift, with `keyCode` in the page whose URL starts with
 * `target`, as the system hands keys to it, so its view hears them first.
 */
const pressShifted = (
  app: ElectronApplication,
  target: string,
  keyCode: string
) =>
  app.evaluate(
    ({ webContents }, request) => {
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(request.target));

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
        isMacOS ? ("meta" as const) : ("control" as const),
        "shift" as const,
      ],
    }
  );

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

test("Move to New Window puts the selected tab's page in a window of its own as it was, marks its tab and selects the next", async ({
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

test("with the shell's renderer gone and loaded again, the window's page keeps its state and its titlebar comes back", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, calendar } = await launch(launchApp, userDataDir, standIn);

  await clickMenuItem(app, "tab.moveToNewWindow");
  await expect.poll(() => ownWindowPage(app)).toBe(calendar.url());

  const first = await findTitlebar(app);

  await mark(calendar);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer();
  });
  await expect.poll(() => first.isClosed()).toBeTruthy();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.reload();
  });

  const titlebar = await findTitlebar(app);

  await expect(
    titlebar
      .getByRole("banner", { name: "Title bar" })
      .getByText(CALENDAR_TITLE)
  ).toBeVisible();
  expect(await marked(calendar)).toBe(42);
  expect(await ownWindowPage(app)).toBe(calendar.url());
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
  await clickMenuItem(app, "profile.remove");

  await expect.poll(() => ownWindowCount(app)).toBe(0);
  await expect.poll(() => pageOpen(app, standIn.calendarUrl)).toBeFalsy();

  const { profiles } = await readState<{ profiles: { id: string }[] }>(
    userDataDir
  );

  expect(profiles.map((profile) => profile.id)).toStrictEqual(["p"]);
});
