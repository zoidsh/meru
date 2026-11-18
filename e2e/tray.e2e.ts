import type { ElectronApplication, Page } from "@playwright/test";

import { DEV_IDENTITY } from "#core/app-identity.ts";

import {
  expect,
  findPage,
  shownViews,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { CALENDAR_TITLE, STAND_IN_TITLE, signIn } from "./lib/stand-in.ts";

const { productName } = DEV_IDENTITY;

/** Home, selected, and Work, whose Calendar tab is selected. */
const seed = async (
  userDataDir: string,
  standIn: StandIn,
  settings: Record<string, unknown>
) => {
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Home" },
      {
        id: "p1",
        name: "Work",
        tabs: [
          {
            id: "gmail",
            app: "gmail",
            url: standIn.url,
            title: STAND_IN_TITLE,
          },
          {
            id: "calendar",
            app: "calendar",
            url: standIn.calendarUrl,
            title: CALENDAR_TITLE,
          },
        ],
        selectedTabId: "calendar",
      },
    ],
    selectedProfileId: "p0",
  });
  await writeSettings(userDataDir, settings);
};

interface TrayState {
  image: string;
  title: string;
  /** Item labels, a separator as "-". */
  menu: string[];
}

/**
 * The captured tray, its menu as a click would open it: the icon's own on
 * Linux, popped up by a right click elsewhere.
 */
const readTray = (app: ElectronApplication) =>
  app.evaluate((): TrayState | undefined => {
    const tray = Reflect.get(globalThis, "meruTestTray") as
      | {
          image: string;
          title: string;
          menu: { kind: string; label?: string }[];
          rightClick: () => void;
        }
      | undefined;

    if (!tray) {
      return undefined;
    }

    if (process.platform !== "linux") {
      tray.rightClick();
    }

    return {
      image: tray.image,
      title: tray.title,
      menu: tray.menu.map((item) => item.label ?? "-"),
    };
  });

const readTrayMenu = async (app: ElectronApplication) => {
  const tray = await readTray(app);

  return tray?.menu;
};

/** Clicks the item after the call returns, since it may quit the app. */
const clickTrayItem = (app: ElectronApplication, label: string) =>
  app.evaluate((_electron, itemLabel) => {
    const tray = Reflect.get(globalThis, "meruTestTray") as {
      rightClick: () => void;
      clickItem: (label: string) => void;
    };

    if (process.platform !== "linux") {
      tray.rightClick();
    }

    setTimeout(() => {
      tray.clickItem(itemLabel);
    }, 0);
  }, label);

const readBadge = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      Reflect.get(globalThis, "meruTestBadge") as
        | { text: string; count: number }
        | undefined
  );

const windowVisible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (window) => !window.getParentWindow() && window.isVisible()
    )
  );

/** Asks the shell window to close, as its close button does. */
const closeWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    setTimeout(() => {
      BrowserWindow.getAllWindows()
        .find((window) => !window.getParentWindow())
        ?.close();
    }, 0);
  });

/** Gmail puts the count in its title, which polls the feed again. */
const retitle = (app: ElectronApplication, standIn: StandIn, title: string) =>
  app.evaluate(
    async ({ session, webContents }, { url, next }) => {
      const page = webContents
        .getAllWebContents()
        .find(
          (candidate) =>
            candidate.session === session.fromPartition("persist:p0") &&
            candidate.getURL().startsWith(url)
        );

      await page?.executeJavaScript(`document.title = ${JSON.stringify(next)}`);
    },
    { url: standIn.url, next: title }
  );

const profileTab = (shell: Page, name: string) =>
  shell
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: new RegExp(`^${name}`, "u") });

const isMacOS = process.platform === "darwin";

const quitLabel: Record<string, string> = {
  darwin: `Quit ${productName}`,
  win32: "Exit",
  linux: "Quit",
};

const QUIT = quitLabel[process.platform] ?? "Quit";

test("shows the total on the badge and the tray, clears both at zero, and jumps to a profile's Gmail from the tray", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn, { tray: true });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.url);
  await signIn(app, standIn, "p0");
  standIn.setFeed("persist:p0", { unreadCount: 120 });
  await retitle(app, standIn, "Inbox (120)");

  await expect.poll(() => readBadge(app)).toMatchObject({ text: "99+" });
  await expect
    .poll(() => readTray(app))
    .toStrictEqual({
      image: isMacOS
        ? "IconMenuBarTemplate.png"
        : expect.stringMatching(/^IconTrayUnread-/u),
      title: isMacOS ? "120" : "",
      menu: ["Home (99+)", "Work", "-", `Hide ${productName}`, "-", QUIT],
    });

  standIn.setFeed("persist:p0", { unreadCount: 0 });
  await retitle(app, standIn, "Inbox");

  await expect.poll(() => readBadge(app)).toBeUndefined();
  await expect
    .poll(() => readTray(app))
    .toStrictEqual({
      image: isMacOS
        ? "IconMenuBarTemplate.png"
        : expect.stringMatching(/^IconTray-/u),
      title: "",
      menu: ["Home", "Work", "-", `Hide ${productName}`, "-", QUIT],
    });

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => !window.getParentWindow())
      ?.hide();
  });
  await clickTrayItem(app, "Work");

  await expect(profileTab(shell, "Work")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(
    shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab", {
      name: STAND_IN_TITLE,
      exact: true,
    })
  ).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => windowVisible(app)).toBeTruthy();
});

test("the tray opens Gmail at its home in a profile where Gmail was closed", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Home" },
      {
        id: "p1",
        name: "Work",
        tabs: [
          {
            id: "calendar",
            app: "calendar",
            url: standIn.calendarUrl,
            title: CALENDAR_TITLE,
          },
        ],
        selectedTabId: "calendar",
      },
    ],
    selectedProfileId: "p0",
  });
  await writeSettings(userDataDir, { tray: true });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.url);
  await clickTrayItem(app, "Work");

  await expect(profileTab(shell, "Work")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(
    shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { selected: true })
  ).toHaveAccessibleName(STAND_IN_TITLE);
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([{ url: standIn.url, partition: "persist:p1" }]);
});

test("closing the window with the tray shown hides it, and the tray's Show or a second launch brings it back", async ({
  launchApp,
  spawnApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn, { tray: true });

  const app = await launchApp();

  await findPage(app, "meru-app:");
  await expect.poll(() => windowVisible(app)).toBeTruthy();
  await closeWindow(app);

  await expect.poll(() => windowVisible(app)).toBeFalsy();
  await expect.poll(() => readTrayMenu(app)).toContain(`Show ${productName}`);

  await clickTrayItem(app, `Show ${productName}`);

  await expect.poll(() => windowVisible(app)).toBeTruthy();

  await closeWindow(app);

  await expect.poll(() => windowVisible(app)).toBeFalsy();

  // The second instance hands over to the first and exits.
  expect(await spawnApp().exited).toBe(0);
  await expect.poll(() => windowVisible(app)).toBeTruthy();
});

test("closing the window quits with the tray off on Windows and Linux, and the tray's Quit ends Meru", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  if (!isMacOS) {
    await seed(userDataDir, standIn, { tray: false });

    const closing = await launchApp();
    const closed = closing.waitForEvent("close");

    await findPage(closing, "meru-app:");
    await closeWindow(closing);
    await closed;
  }

  await seed(userDataDir, standIn, { tray: true });

  const app = await launchApp();
  const closed = app.waitForEvent("close");

  await findPage(app, "meru-app:");
  await expect.poll(() => readTray(app)).toBeDefined();
  await clickTrayItem(app, QUIT);
  await closed;
});
