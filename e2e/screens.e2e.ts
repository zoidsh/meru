// Pictures for a person to look at, taken with MERU_E2E_SHOTS=1; they assert
// nothing of what they show.
import type { ElectronApplication, Page } from "@playwright/test";

import {
  expect,
  findPage,
  findOverlayDocument,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import {
  THEMES,
  emulateTheme,
  onlyWithShots,
  shootWindow,
  shotPath,
} from "./lib/shots.ts";
import {
  ANY_SESSION,
  DARK_PARTS,
  POPOUT_PATH,
  THREAD_PARTS,
  openDarkThread,
  openThread,
} from "./lib/stand-in.ts";

test.beforeEach(() => {
  onlyWithShots();
});

const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  settings: object = {}
) => {
  await writeSettings(userDataDir, settings);

  const app = await launchApp();

  return { app, shell: await findPage(app, "meru-app:") };
};

/** Shoots the whole window as `surface` in each theme. */
const shootEachWay = async (
  app: ElectronApplication,
  shell: Page,
  surface: string
) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await shootWindow(app, shell, shotPath(surface, theme));
  }
};

test("the window with the sidebar narrow, wide and hidden", async ({
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
          { id: "c1", app: "calendar", url: standIn.calendarUrl, title: "" },
        ],
        selectedTabId: "gmail",
      },
    ],
    selectedProfileId: "p",
  });

  const { app, shell } = await launch(launchApp, userDataDir);
  // Away from every control, so no hover shows in the picture.
  const rest = () => shell.mouse.move(700, 20);

  await findPage(app, standIn.url);
  await shootEachWay(app, shell, "window-narrow");

  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await rest();
  await shootEachWay(app, shell, "window-wide");

  await shell.getByRole("button", { name: "Sidebar", exact: true }).click();
  await rest();
  await expect(shell.getByRole("tablist", { name: "Tabs" })).toHaveCount(0);
  await shootEachWay(app, shell, "window-hidden");
});

test("the titlebar with two profiles, and with more than fit", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const names = [
    "Personal",
    "Dev",
    "Work",
    "Side project",
    "Family",
    "Community garden volunteers",
    "Freelance",
    "School",
  ];

  await writeState(userDataDir, {
    profiles: names.map((name, index) => ({ id: `p${index}`, name })),
    selectedProfileId: "p0",
  });

  const { app, shell } = await launch(launchApp, userDataDir);
  const rest = () => shell.mouse.move(700, 300);

  await findPage(app, standIn.url);
  await expect(
    shell.getByRole("group", { name: "Profiles" }).getByRole("button")
  ).toHaveCount(8);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(900, 560);
  });
  await expect(
    shell.getByRole("button", { name: "Scroll profiles right" })
  ).toBeVisible();
  await rest();
  await shootEachWay(app, shell, "titlebar-overflow");

  // Two of them, the second selected, at the same size.
  await writeState(userDataDir, {
    profiles: names
      .slice(0, 2)
      .map((name, index) => ({ id: `p${index}`, name })),
    selectedProfileId: "p1",
  });
  await app.close();

  const two = await launch(launchApp, userDataDir);

  await findPage(two.app, standIn.url);
  await expect(
    two.shell.getByRole("group", { name: "Profiles" }).getByRole("button")
  ).toHaveCount(2);
  await two.shell.mouse.move(700, 300);
  await shootEachWay(two.app, two.shell, "titlebar-two");
});

test("the rename profile overlay", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir);
  const overlay = await findOverlayDocument(app);
  const field = overlay.getByRole("textbox", { name: "Rename profile" });

  await findPage(app, standIn.url);
  await app.evaluate(({ Menu, BrowserWindow }) => {
    Menu.getApplicationMenu()
      ?.getMenuItemById("profile.rename")
      ?.click(undefined, BrowserWindow.getAllWindows()[0]);
  });
  await expect(field).toBeFocused();
  await shootEachWay(app, shell, "rename");
});

// Its button, in the titlebar and below the narrow and wide sidebar's last
// tab, is in the window shots above.
test("the Open app overlay", async ({ launchApp, userDataDir, standIn }) => {
  const { app, shell } = await launch(launchApp, userDataDir);
  const overlay = await findOverlayDocument(app);

  await findPage(app, standIn.url);
  await shell.mouse.move(700, 20);
  await app.evaluate(({ Menu, BrowserWindow }) => {
    Menu.getApplicationMenu()
      ?.getMenuItemById("app.open")
      ?.click(undefined, BrowserWindow.getAllWindows()[0]);
  });
  await expect(
    overlay.getByRole("combobox", { name: "Open app" })
  ).toBeFocused();
  await shootEachWay(app, shell, "open-app");
});

const nothingOpen = (id: string, name: string) => ({
  id,
  name,
  tabs: [],
  selectedTabId: "",
});

for (const { signedIn, surface, heading } of [
  { signedIn: true, surface: "nothing-open", heading: "No apps open" },
  { signedIn: false, surface: "sign-in-required", heading: "Sign in required" },
]) {
  test(`the page area of a profile with no app open, ${signedIn ? "signed in" : "signed out"}, with one profile and two`, async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    if (signedIn) {
      standIn.setFeed(ANY_SESSION, { unreadCount: 0 });
    }

    for (const profiles of [
      [nothingOpen("p0", "Home")],
      [nothingOpen("p0", "Home"), nothingOpen("p1", "Work")],
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      await writeState(userDataDir, { profiles, selectedProfileId: "p0" });

      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      const { app, shell } = await launch(launchApp, userDataDir);

      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      await expect(shell.getByRole("heading", { name: heading })).toBeVisible();
      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      await shell.mouse.move(700, 20);
      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      await shootEachWay(
        app,
        shell,
        profiles.length > 1 ? `${surface}-two-profiles` : surface
      );
      // oxlint-disable-next-line no-await-in-loop -- one launch at a time
      await app.close();
    }
  });
}

test("a thread with every thread feature on", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, {
    reverseConversation: true,
    moveAttachmentsToTop: true,
    showTrimmedContent: true,
  });
  const view = await findPage(app, standIn.url);

  await openThread(view, 3);
  await expect(view.getByText(THREAD_PARTS.quoted(1))).toBeVisible();
  await shootEachWay(app, shell, "thread");
});

test("a thread and a docked compose while Gmail is Dark, with the dark theme on and off", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir);
  const view = await findPage(app, standIn.url);
  const pane = view.getByRole("region", { name: DARK_PARTS.pane });
  const background = () =>
    pane.evaluate((element) => getComputedStyle(element).backgroundColor);

  await openDarkThread(view, true);
  await emulateTheme(app, "dark");

  for (const on of [true, false]) {
    // oxlint-disable-next-line no-await-in-loop -- one state at a time
    await app.evaluate(async (_electron, value) => {
      const settings = Reflect.get(globalThis, "meruTestSettings") as {
        set: (key: string, value: unknown) => Promise<void>;
      };

      await settings.set("extendDarkTheme", value);
    }, on);
    // oxlint-disable-next-line no-await-in-loop -- one state at a time
    await expect
      .poll(background)
      .toBe(on ? "rgba(0, 0, 0, 0)" : "rgb(255, 255, 255)");
    // oxlint-disable-next-line no-await-in-loop -- one state at a time
    await shootWindow(app, shell, shotPath(`gmail-dark-${on ? "on" : "off"}`));
  }
});

test("Gmail's pop-out, which shows Gmail's page alone", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await view.getByRole("button", { name: "Pop out compose" }).click();

  const popout = await findPage(app, `${standIn.url}${POPOUT_PATH.slice(1)}`);

  await popout.screenshot({ path: shotPath("popout") });
});
