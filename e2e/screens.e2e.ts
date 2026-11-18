// Pictures for a person to look at, taken with MERU_E2E_SHOTS=1; they assert
// nothing of what they show.
import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

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
  CALENDAR_TITLE,
  DARK_PARTS,
  DRIVE_TITLE,
  POPOUT_PATH,
  STAND_IN_TITLE,
  THREAD_PARTS,
  openDarkThread,
  openThread,
} from "./lib/stand-in.ts";
import type { StandIn } from "./lib/stand-in.ts";

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

/**
 * Gmail and the first `count - 1` of Calendar and Drive pinned, Drive
 * selected, and Docs and Sheets in the list, which no app has two of so the
 * sidebar starts narrow.
 */
const withPinned = (standIn: StandIn, count: number) => ({
  profiles: [
    {
      id: "p",
      name: "Default",
      tabs: [
        { id: "gmail", app: "gmail", url: standIn.url, title: "" },
        {
          id: "c1",
          app: "calendar",
          url: standIn.calendarUrl,
          title: "",
          pinned: count > 1,
        },
        {
          id: "d1",
          app: "drive",
          url: standIn.driveUrl,
          title: "",
          pinned: count > 2,
        },
        // Never selected, so never loaded.
        { id: "o", app: "docs", url: standIn.driveUrl, title: "" },
        { id: "s", app: "sheets", url: standIn.driveUrl, title: "" },
      ],
      selectedTabId: "d1",
    },
  ],
  selectedProfileId: "p",
});

for (const { count, signedIn } of [
  { count: 1, signedIn: true },
  { count: 2, signedIn: true },
  { count: 3, signedIn: true },
  { count: 3, signedIn: false },
]) {
  const surface = `pinned-${count}${signedIn ? "" : "-signed-out"}`;

  test(`the pinned area with ${count} pinned, ${signedIn ? "with Gmail's unread count" : "with the sign-in mark"}, narrow and wide`, async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    if (signedIn) {
      standIn.setFeed(ANY_SESSION, { unreadCount: 12 });
    }

    await writeState(userDataDir, withPinned(standIn, count));

    const { app, shell } = await launch(launchApp, userDataDir);
    const gmail = shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { name: STAND_IN_TITLE, exact: true });
    const rest = () => shell.mouse.move(700, 20);

    await findPage(app, standIn.driveUrl);
    await findPage(app, standIn.url);
    await (signedIn
      ? expect(gmail).toHaveText(/12$/u)
      : expect(gmail).toHaveAttribute(
          "title",
          `${STAND_IN_TITLE} · sign in required`
        ));
    await rest();
    await shootEachWay(app, shell, `${surface}-narrow`);

    await shell.getByRole("button", { name: "Widen sidebar" }).click();
    await rest();
    await shootEachWay(app, shell, `${surface}-wide`);
  });
}

test("the line a dragged tab would land at, in the list and in the wide pinned grid", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, withPinned(standIn, 3));

  const { app, shell } = await launch(launchApp, userDataDir);
  const tab = (name: string) =>
    shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { name, exact: true });

  /** Drags `from` to `share` of the way across and down `over`, and holds it there. */
  const hold = async (
    from: string,
    over: string,
    across: number,
    down: number
  ) => {
    const start = await tab(from).boundingBox();
    const end = await tab(over).boundingBox();

    await shell.mouse.move(
      (start?.x ?? 0) + (start?.width ?? 0) / 2,
      (start?.y ?? 0) + (start?.height ?? 0) / 2
    );
    await shell.mouse.down();
    await shell.mouse.move(
      (end?.x ?? 0) + (end?.width ?? 0) * across,
      (end?.y ?? 0) + (end?.height ?? 0) * down,
      { steps: 8 }
    );
  };

  const letGo = async () => {
    await shell.keyboard.press("Escape");
    await shell.mouse.up();
  };

  await findPage(app, standIn.driveUrl);
  await findPage(app, standIn.url);

  await hold("Sheets", "Docs", 0.5, 0.1);
  await shootEachWay(app, shell, "drag-list");
  await letGo();

  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await hold("Drive stand-in", "Calendar", 0.1, 0.5);
  await shootEachWay(app, shell, "drag-pinned-wide");
  await letGo();

  await hold("Sheets", "Docs", 0.5, 0.1);
  await shootEachWay(app, shell, "drag-list-wide");
  await letGo();
});

test("a tab's menu on a pinned tile and on a listed tab", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  standIn.setFeed(ANY_SESSION, { unreadCount: 3 });
  await writeState(userDataDir, withPinned(standIn, 2));

  const { app, shell } = await launch(launchApp, userDataDir);
  const list = shell.getByRole("tablist", { name: "Tabs" });

  await findPage(app, standIn.driveUrl);
  await findPage(app, standIn.url);

  for (const [title, surface] of [
    [STAND_IN_TITLE, "tab-menu-pinned"],
    ["Docs", "tab-menu"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one menu at a time
    await list.getByRole("tab", { name: title, exact: true }).click({
      button: "right",
    });

    // oxlint-disable-next-line no-await-in-loop -- one menu at a time
    const overlay = await findOverlayDocument(app);
    const menu = overlay.getByRole("menu", { name: title });

    // oxlint-disable-next-line no-await-in-loop -- one menu at a time
    await expect(menu).toBeVisible();
    // Away from every item, so none is highlighted in the picture.
    // oxlint-disable-next-line no-await-in-loop -- one menu at a time
    await overlay.mouse.move(900, 600);
    // oxlint-disable-next-line no-await-in-loop -- one menu at a time
    await shootEachWay(app, shell, surface);
    // oxlint-disable-next-line no-await-in-loop -- one menu at a time
    await overlay.keyboard.press("Escape");
    // oxlint-disable-next-line no-await-in-loop -- one menu at a time
    await expect(menu).toHaveCount(0);
  }
});

test("sleeping tiles and rows, and the sleeping pane of the selected tab put to sleep, wide and narrow", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  standIn.setFeed(ANY_SESSION, { unreadCount: 3 });
  await writeState(userDataDir, withPinned(standIn, 2));

  const { app, shell } = await launch(launchApp, userDataDir);
  const list = shell.getByRole("tablist", { name: "Tabs" });
  const rest = () => shell.mouse.move(700, 20);

  await findPage(app, standIn.driveUrl);
  await findPage(app, standIn.url);
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await list.getByRole("tab", { name: DRIVE_TITLE, exact: true }).click({
    button: "right",
  });

  const overlay = await findOverlayDocument(app);

  await overlay.getByRole("menuitem", { name: "Sleep", exact: true }).click();
  await expect(
    shell.getByRole("button", { name: "Wake", exact: true })
  ).toBeFocused();
  await rest();
  await shootEachWay(app, shell, "sleeping-wide");

  await shell.getByRole("button", { name: "Narrow sidebar" }).click();
  await rest();
  await shootEachWay(app, shell, "sleeping-narrow");
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

test("a sleeping profile in the titlebar, and its menu", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  standIn.setFeed(ANY_SESSION, { unreadCount: 3 });
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Personal" },
      { id: "p1", name: "Work", asleep: true },
      { id: "p2", name: "Dev" },
    ],
    selectedProfileId: "p0",
  });

  const { app, shell } = await launch(launchApp, userDataDir);
  const row = shell.getByRole("group", { name: "Profiles" });
  const rest = () => shell.mouse.move(700, 300);

  await findPage(app, standIn.url);
  await expect(
    row.getByRole("button", { name: "Work, asleep, 3 unread messages" })
  ).toBeVisible();
  await rest();
  await shootEachWay(app, shell, "titlebar-sleeping");

  const menuOf = async (name: string) => {
    await row
      .getByRole("button", { name: new RegExp(`^${name}`, "u") })
      .click({ button: "right" });

    const overlay = await findOverlayDocument(app);
    const menu = overlay.getByRole("menu", { name });

    await expect(menu).toBeVisible();

    return { overlay, menu };
  };

  const work = await menuOf("Work");

  // Away from the item, so it is not highlighted in the picture.
  await work.overlay.mouse.move(900, 600);
  await shootEachWay(app, shell, "profile-menu");
  await work.overlay.keyboard.press("Escape");
  await expect(work.menu).toHaveCount(0);
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

const pane = (size: number, inner: unknown) => ({ size, pane: inner });

/** Calendar, Drive and Gmail with `root` as their split, `selected` focused. */
const withSplit = (standIn: StandIn, root: unknown, selected: string) => ({
  profiles: [
    {
      id: "p",
      name: "Default",
      tabs: [
        { id: "gmail", app: "gmail", url: standIn.url, title: "" },
        { id: "c1", app: "calendar", url: standIn.calendarUrl, title: "" },
        { id: "d1", app: "drive", url: standIn.driveUrl, title: "" },
        // Outside the split, and never loaded.
        { id: "o", app: "docs", url: standIn.driveUrl, title: "" },
      ],
      selectedTabId: selected,
      split: { root },
    },
  ],
  selectedProfileId: "p",
});

test("split panes: two side by side, and three nested with the sidebar narrow and wide", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(
    userDataDir,
    withSplit(
      standIn,
      { direction: "row", children: [pane(0.5, "c1"), pane(0.5, "d1")] },
      "d1"
    )
  );

  const first = await launch(launchApp, userDataDir);

  await findPage(first.app, standIn.calendarUrl);
  await findPage(first.app, standIn.driveUrl);
  await first.shell.mouse.move(700, 20);
  await shootEachWay(first.app, first.shell, "split-two");
  await first.app.close();

  await writeState(
    userDataDir,
    withSplit(
      standIn,
      {
        direction: "row",
        children: [
          pane(0.5, "c1"),
          pane(0.5, {
            direction: "column",
            children: [pane(0.5, "d1"), pane(0.5, "gmail")],
          }),
        ],
      },
      "gmail"
    )
  );

  const { app, shell } = await launch(launchApp, userDataDir);
  const rest = () => shell.mouse.move(700, 20);

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);
  await findPage(app, standIn.url);
  await rest();
  await shootEachWay(app, shell, "split-nested-narrow");
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await rest();
  await shootEachWay(app, shell, "split-nested-wide");
});

test("a sleeping pane in a split", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(
    userDataDir,
    withSplit(
      standIn,
      { direction: "row", children: [pane(0.5, "c1"), pane(0.5, "gmail")] },
      "c1"
    )
  );

  const { app, shell } = await launch(launchApp, userDataDir);

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.url);
  await shell
    .getByRole("tablist", { name: "Tabs" })
    .getByRole("tab", { name: STAND_IN_TITLE, exact: true })
    .click({ button: "right" });

  const overlay = await findOverlayDocument(app);

  await overlay.getByRole("menuitem", { name: "Sleep", exact: true }).click();
  await expect(
    shell.getByRole("region", { name: `${STAND_IN_TITLE} is sleeping` })
  ).toBeVisible();
  await shell.mouse.move(700, 20);
  await shootEachWay(app, shell, "split-sleeping");
});

/**
 * Gmail, Drive and Meet pinned, then Calendar, Sheets, Drive and Slides,
 * with `root` as the split and Calendar selected; no app has two tabs
 * that are not pinned, so the sidebar starts narrow. Only Gmail, Calendar
 * and Drive go in a pane, whose stand-ins their apps claim.
 */
const withBox = (standIn: StandIn, root: unknown) => ({
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
          id: "k",
          app: "drive",
          url: standIn.driveUrl,
          title: "Plans",
          pinned: true,
        },
        {
          id: "k2",
          app: "meet",
          url: standIn.driveUrl,
          title: "Standup",
          pinned: true,
        },
        { id: "c1", app: "calendar", url: standIn.calendarUrl, title: "" },
        { id: "s", app: "sheets", url: standIn.driveUrl, title: "Budget" },
        { id: "d1", app: "drive", url: standIn.driveUrl, title: "" },
        { id: "l", app: "slides", url: standIn.driveUrl, title: "Pitch" },
      ],
      selectedTabId: "c1",
      split: { root },
    },
  ],
  selectedProfileId: "p",
});

/** Moves the pointer off the sidebar, so no tab shows its hover. */
const rest = (shell: Page) => shell.mouse.move(700, 20);

test("a split's box in the sidebar, in the list and in the pinned area, narrow and wide", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(
    userDataDir,
    withBox(standIn, {
      direction: "row",
      children: [pane(0.5, "d1"), pane(0.5, "c1")],
    })
  );

  const first = await launch(launchApp, userDataDir);

  await findPage(first.app, standIn.calendarUrl);
  await findPage(first.app, standIn.driveUrl);
  await rest(first.shell);
  await shootEachWay(first.app, first.shell, "split-box-list-narrow");
  await first.shell.getByRole("button", { name: "Widen sidebar" }).click();
  await rest(first.shell);
  await shootEachWay(first.app, first.shell, "split-box-list-wide");
  await first.app.close();

  await writeState(
    userDataDir,
    withBox(standIn, {
      direction: "row",
      children: [
        pane(0.5, "c1"),
        pane(0.5, {
          direction: "column",
          children: [pane(0.5, "k"), pane(0.5, "gmail")],
        }),
      ],
    })
  );

  const { app, shell } = await launch(launchApp, userDataDir);
  const narrow = shell.getByRole("button", { name: "Narrow sidebar" });

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);
  await findPage(app, standIn.url);

  // Whether the width chosen before the relaunch is kept is not this shot's
  // to say.
  if ((await narrow.count()) > 0) {
    await narrow.click();
  }

  await rest(shell);
  await shootEachWay(app, shell, "split-box-pinned-narrow");
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await rest(shell);
  await shootEachWay(app, shell, "split-box-pinned-wide");
});

test("a tab dragged in the split's box: the inset line among its tabs, and the ring on a tab of it", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(
    userDataDir,
    withBox(standIn, {
      direction: "row",
      children: [pane(0.5, "d1"), pane(0.5, "c1")],
    })
  );

  const { app, shell } = await launch(launchApp, userDataDir);
  const tab = (name: string) =>
    shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { name, exact: true });

  /** Drags `from` to `down` of the way down `over`, and holds it there. */
  const hold = async (from: string, over: string, down: number) => {
    const start = await tab(from).boundingBox();
    const end = await tab(over).boundingBox();

    await shell.mouse.move(
      (start?.x ?? 0) + (start?.width ?? 0) / 2,
      (start?.y ?? 0) + (start?.height ?? 0) / 2
    );
    await shell.mouse.down();
    await shell.mouse.move(
      (end?.x ?? 0) + (end?.width ?? 0) / 2,
      (end?.y ?? 0) + (end?.height ?? 0) * down,
      { steps: 8 }
    );
  };

  const letGo = async () => {
    await shell.keyboard.press("Escape");
    await shell.mouse.up();
  };

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);

  await hold(CALENDAR_TITLE, DRIVE_TITLE, 0.2);
  await shootEachWay(app, shell, "drag-split-box-line");
  await letGo();

  await hold("Budget", DRIVE_TITLE, 0.5);
  await shootEachWay(app, shell, "drag-split-ring");
  await letGo();
});

test("a tab dragged over the pages: the lit half of a pane, the band along the view's edge, and Not enough room", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(
    userDataDir,
    withBox(standIn, {
      direction: "row",
      children: [pane(0.5, "d1"), pane(0.5, "c1")],
    })
  );

  const { app, shell } = await launch(launchApp, userDataDir);
  const overlay = await findOverlayDocument(app);
  const label = (text: string) => overlay.getByText(text, { exact: true });

  /**
   * Drags Budget to `across` and `down` of the way over `selector`'s
   * element, and holds it there until what lights up says `shows`.
   */
  const hold = async (
    selector: string,
    across: number,
    down: number,
    shows: string
  ) => {
    const start = await shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { name: "Budget", exact: true })
      .boundingBox();
    const end = await shell.evaluate(
      (each) => document.querySelector(each)?.getBoundingClientRect().toJSON(),
      selector
    );

    await shell.mouse.move(
      (start?.x ?? 0) + (start?.width ?? 0) / 2,
      (start?.y ?? 0) + (start?.height ?? 0) / 2
    );
    await shell.mouse.down();
    await shell.mouse.move(
      (end?.x ?? 0) + (end?.width ?? 0) * across,
      (end?.y ?? 0) + (end?.height ?? 0) * down,
      { steps: 8 }
    );
    await expect(label(shows)).toBeVisible();
  };

  const letGo = async (shows: string) => {
    await shell.keyboard.press("Escape");
    await shell.mouse.up();
    await expect(label(shows)).toHaveCount(0);
  };

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);

  await hold('[data-pane="c1"]', 0.8, 0.5, "Split this pane");
  await shootEachWay(app, shell, "drag-view-half");
  await letGo("Split this pane");

  await hold("[data-page-area]", 0.005, 0.5, "Along the whole view");
  await shootEachWay(app, shell, "drag-view-edge");
  await letGo("Along the whole view");

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(720, 480);
  });
  await expect.poll(() => shell.evaluate(() => window.innerWidth)).toBe(720);
  await hold('[data-pane="c1"]', 0.5, 0.2, "Not enough room");
  await shootEachWay(app, shell, "drag-view-no-room");
  await letGo("Not enough room");
});

test("uneven panes with a gap's handle hovered and focused, and a maximized split's box, narrow and wide", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(
    userDataDir,
    withSplit(
      standIn,
      { direction: "row", children: [pane(0.7, "c1"), pane(0.3, "d1")] },
      "c1"
    )
  );

  const first = await launch(launchApp, userDataDir);
  const handle = first.shell.getByRole("separator", { name: "Resize panes" });

  await findPage(first.app, standIn.calendarUrl);
  await findPage(first.app, standIn.driveUrl);
  await handle.hover();
  await shootEachWay(first.app, first.shell, "split-uneven");
  await first.shell.mouse.move(700, 20);
  await handle.focus();
  await shootEachWay(first.app, first.shell, "split-handle-focused");
  await first.app.close();

  const maximized = withBox(standIn, {
    direction: "row",
    children: [pane(0.5, "d1"), pane(0.5, "c1")],
  });

  await writeState(userDataDir, {
    ...maximized,
    profiles: maximized.profiles.map((profile) => ({
      ...profile,
      split: { ...profile.split, maximized: true },
    })),
  });

  const { app, shell } = await launch(launchApp, userDataDir);

  await findPage(app, standIn.calendarUrl);
  await rest(shell);
  await shootEachWay(app, shell, "split-maximized-narrow");
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await rest(shell);
  await shootEachWay(app, shell, "split-maximized-wide");
});

/** Asks for a split the window has no room for, which shows the toast. */
const refuseSplit = async (app: ElectronApplication, overlay: Page) => {
  await app.evaluate(({ Menu, BrowserWindow }) => {
    Menu.getApplicationMenu()
      ?.getMenuItemById("tab.splitDown")
      ?.click(undefined, BrowserWindow.getAllWindows()[0]);
  });
  await expect(
    overlay.getByText("Not enough room to split", { exact: true })
  ).toBeVisible();
  // Lets the toast slide in.
  await delay(600);

  return overlay.getByText("Not enough room to split", { exact: true });
};

test("the toast refusing a split in a small window", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir);
  const overlay = await findOverlayDocument(app);

  await findPage(app, standIn.url);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(720, 480);
  });
  await shell.mouse.move(300, 20);

  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one toast at a time
    const toast = await refuseSplit(app, overlay);

    // oxlint-disable-next-line no-await-in-loop -- one toast at a time
    await shootWindow(app, shell, shotPath("toast", theme));
    // oxlint-disable-next-line no-await-in-loop -- one toast at a time
    await expect(toast).toHaveCount(0, { timeout: 8000 });
  }
});
