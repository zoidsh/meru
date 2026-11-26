// Updates go through the suite build's stand-in updater, which reaches no
// feed and never relaunches the app; the default browser is stubbed before
// anything would open in it.
import type { ElectronApplication, Page } from "@playwright/test";

import { UPDATE_CARD_VIEW } from "#core/overlay.ts";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readMenuItem,
  readOpenedExternally,
  stubSystemBrowser,
  readState,
  test,
  writeState,
} from "./lib/app.ts";
import { findTitlebar, readOwnWindows } from "./lib/own-window.ts";
import { SETTINGS_URL, openSettings } from "./lib/settings.ts";
import {
  THEMES,
  emulateTheme,
  onlyWithShots,
  shootWindow,
  shotPath,
} from "./lib/shots.ts";
import { askedUpdater, emitUpdate } from "./lib/updates.ts";

const READY = "Meru 4.2.0 is ready. Restart to finish installing it.";
const UNVERIFIED =
  "Meru couldn't verify the downloaded update, so it wasn't installed.";

const ready = (app: ElectronApplication, version = "4.2.0") =>
  emitUpdate(
    app,
    { kind: "available", version },
    { kind: "downloaded", version }
  );

const unverified = (app: ElectronApplication) =>
  emitUpdate(
    app,
    { kind: "available", version: "4.2.1" },
    { kind: "error", signature: true }
  );

/** The card's buttons in the overlay's document, in their order. */
const cardButtons = (overlay: Page) =>
  overlay.getByRole("button").allTextContents();

/** The overlay's view: whether it shows, where, and whether it has the keys. */
const readOverlayView = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    const view = window?.contentView.children
      .map((child) => child as Electron.WebContentsView)
      .find((child) => child.webContents.mainFrame.name === "meru-overlay");

    return {
      visible: view?.getVisible(),
      bounds: view?.getBounds(),
      focused: view?.webContents.isFocused(),
      area: window?.contentView.getBounds() ?? { width: 0, height: 0 },
    };
  });

const launch = async (launchApp: () => Promise<ElectronApplication>) => {
  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);

  await stubSystemBrowser(app);

  return { app, shell, overlay };
};

test("shows a ready version at the page's bottom right without taking the keys; What's new opens its release page, a card opened over it takes its place until it closes, and Later hides it until a newer version", async ({
  launchApp,
}) => {
  const { app, overlay } = await launch(launchApp);

  await ready(app);

  await expect(overlay.getByRole("status")).toHaveText(READY);
  expect(await cardButtons(overlay)).toStrictEqual([
    "What's new",
    "Later",
    "Restart now",
  ]);

  const view = await readOverlayView(app);
  const bounds = view.bounds ?? { x: 0, y: 0, width: 0, height: 0 };

  // The card's own view at the page area's bottom right, the pages beside it
  // taking their own presses.
  expect(view).toMatchObject({ visible: true, focused: false });
  expect([bounds.width, bounds.height, bounds.x + bounds.width]).toStrictEqual([
    UPDATE_CARD_VIEW.width,
    UPDATE_CARD_VIEW.height,
    view.area.width - 8,
  ]);

  await overlay.getByRole("button", { name: "What's new" }).click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual(["https://github.com/zoidsh/meru/releases/tag/v4.2.0"]);

  // Tab moves among its buttons once a click has put the keys in it.
  await overlay.keyboard.press("Tab");
  await expect(overlay.getByRole("button", { name: "Later" })).toBeFocused();

  // A card opened over it takes the view, and it comes back once that closes.
  await clickMenuItem(app, "downloads.toggle");
  await expect(
    overlay.getByRole("dialog", { name: "Downloads" })
  ).toBeVisible();
  await expect(overlay.getByRole("status")).toHaveCount(0);
  await overlay.keyboard.press("Escape");
  await expect(overlay.getByRole("status")).toHaveText(READY);

  // Later hides it through later checks of that version.
  await overlay.getByRole("button", { name: "Later" }).click();
  await expect(overlay.getByRole("status")).toHaveCount(0);
  await expect
    .poll(() => readOverlayView(app))
    .toMatchObject({ visible: false });
  await emitUpdate(
    app,
    { kind: "checking" },
    { kind: "available", version: "4.2.0" }
  );
  await expect(overlay.getByRole("status")).toHaveCount(0);

  // A newer version shows it again, and Escape in it is Later too.
  await ready(app, "4.2.1");
  await expect(overlay.getByRole("status")).toHaveText(
    "Meru 4.2.1 is ready. Restart to finish installing it."
  );
  await overlay.getByRole("button", { name: "Later" }).focus();
  await overlay.keyboard.press("Escape");
  await expect(overlay.getByRole("status")).toHaveCount(0);
});

/** Ten Calendar tabs after Gmail, none of them loaded. */
const CALENDARS = Array.from({ length: 10 }, (_, index) => `c${index}`);

test("Restart now installs only once the quit has saved what it saves", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          ...CALENDARS.map((id) => ({
            id,
            app: "calendar",
            url: standIn.calendarUrl,
            title: "",
          })),
        ],
        selectedTabId: "gmail",
      },
    ],
    selectedProfileId: "p",
  });

  const { app, overlay } = await launch(launchApp);
  const log: string[] = [];

  app.process().stderr?.on("data", (chunk: Buffer) => {
    log.push(chunk.toString());
  });
  await ready(app);
  await expect(overlay.getByRole("status")).toHaveText(READY);

  const closed = app.waitForEvent("close");

  // Nine moves that reverse the Calendar tabs are sent in the same turn as
  // the click, so their writes, each after the one ahead of it and no two
  // leaving the same order, are still out as the quit begins. The overlay's
  // document reaches the shell's calls through its opener, the shell. The
  // app can exit before the evaluation answers, which then rejects with the
  // closed target, and only with that.
  await overlay
    .getByRole("button", { name: "Restart now" })
    .evaluate((button: HTMLElement, ids) => {
      const { calls } = Reflect.get(window.opener as object, "meru") as {
        calls: {
          moveTab: (request: {
            profileId: string;
            tabId: string;
            before?: string;
          }) => Promise<void>;
        };
      };

      for (const [index, tabId] of ids.entries()) {
        const before = ids[index - 1];

        if (before !== undefined) {
          void calls.moveTab({ profileId: "p", tabId, before });
        }
      }

      button.click();
    }, CALENDARS)
    .catch((error: unknown) => {
      if (
        !(error instanceof Error) ||
        !error.message.includes(
          "Target page, context or browser has been closed"
        )
      ) {
        throw error;
      }
    });
  await closed;

  const stored = await readState<{ profiles: { tabs: { id: string }[] }[] }>(
    userDataDir
  );

  expect(log.join("")).toContain("meruTestUpdater: quit and install");
  expect(
    stored.profiles[0]?.tabs.map(({ id }) => id).filter((id) => id !== "gmail")
  ).toStrictEqual(CALENDARS.toReversed());
});

test("says a version could not be verified, Download opening its release page and Close putting it away", async ({
  launchApp,
}) => {
  const { app, overlay } = await launch(launchApp);

  await ready(app);
  await unverified(app);

  await expect(overlay.getByRole("status")).toHaveText(UNVERIFIED);
  expect(await cardButtons(overlay)).toStrictEqual(["Close", "Download"]);

  await overlay.getByRole("button", { name: "Download" }).click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual(["https://github.com/zoidsh/meru/releases/tag/v4.2.1"]);
  await overlay.getByRole("button", { name: "Close" }).click();
  await expect(overlay.getByRole("status")).toHaveCount(0);
});

test("shows only in the main window, never in a tab's own window or in Settings", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
        ],
        selectedTabId: "c",
      },
    ],
    selectedProfileId: "p",
  });

  const { app, overlay } = await launch(launchApp);

  await findPage(app, standIn.calendarUrl);
  await clickMenuItem(app, "tab.moveToNewWindow");

  const titlebar = await findTitlebar(app);

  await ready(app);
  await expect(overlay.getByRole("status")).toHaveText(READY);

  const settings = await openSettings(app);

  await expect(settings.getByText(READY)).toHaveCount(0);
  await expect(titlebar.getByText(READY)).toHaveCount(0);

  const [window] = await readOwnWindows(app);

  expect(window?.views.map((view) => view.name)).not.toContain("meru-overlay");
});

test.describe("Check for Updates…", () => {
  test("opens Settings on About and checks there", async ({ launchApp }) => {
    const { app } = await launch(launchApp);

    await expect
      .poll(() => readMenuItem(app, "app.checkForUpdates"))
      .toStrictEqual({
        label: "Check for Updates…",
        enabled: true,
        checked: false,
      });
    // The launch's check, which the stand-in leaves running.
    await expect.poll(() => askedUpdater(app)).toMatchObject({ checks: 1 });
    await emitUpdate(app, { kind: "notAvailable" });
    await clickMenuItem(app, "app.checkForUpdates");

    const page = await findPage(app, SETTINGS_URL);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("About");
    await expect(
      page.getByRole("main").getByText("Checking for updates…")
    ).toBeVisible();
    expect(await askedUpdater(app)).toMatchObject({ checks: 2 });
  });
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  for (const [name, show, text] of [
    ["update-card-ready", ready, READY],
    [
      "update-card-unverified",
      async (app: ElectronApplication) => {
        await ready(app);
        await unverified(app);
      },
      UNVERIFIED,
    ],
  ] as const) {
    test(`the ${name.replace("update-card-", "")} card in the main window, light and dark`, async ({
      launchApp,
    }) => {
      const { app, shell, overlay } = await launch(launchApp);

      await show(app);
      await expect(overlay.getByRole("status")).toHaveText(text);

      for (const theme of THEMES) {
        // oxlint-disable-next-line no-await-in-loop -- one theme at a time
        await emulateTheme(app, theme);
        // oxlint-disable-next-line no-await-in-loop -- one after another
        await shootWindow(app, shell, shotPath(name, theme));
      }
    });
  }
});
