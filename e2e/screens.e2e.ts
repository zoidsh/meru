// Pictures for a person to look at, taken with MERU_E2E_SHOTS=1; they assert
// nothing of what they show.
import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import {
  chooseContextMenuItem,
  expect,
  findPage,
  findOverlayDocument,
  openContextMenu,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import {
  findTitlebar,
  findWindowFind,
  readOwnWindows,
} from "./lib/own-window.ts";
import {
  THEMES,
  emulateTheme,
  onlyWithShots,
  shootOwnWindow,
  shootWindow,
  shotPath,
} from "./lib/shots.ts";
import {
  ANY_SESSION,
  CALENDAR_TITLE,
  DARK_PARTS,
  DRIVE_TITLE,
  FIND_MATCHES,
  FIND_WORD,
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
  await openContextMenu(app, () =>
    list.getByRole("tab", { name: DRIVE_TITLE, exact: true }).click({
      button: "right",
    })
  );
  await chooseContextMenuItem(app, "Sleep");
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

test("a sleeping profile in the titlebar", async ({
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
test("the New tab overlay", async ({ launchApp, userDataDir, standIn }) => {
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
    overlay.getByRole("combobox", { name: "New tab" })
  ).toBeFocused();
  await shootEachWay(app, shell, "new-tab");
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
      splits: [{ root }],
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

/** Opens Find over the selected page and searches it for `term`, counted as `count`. */
const findInPage = async (
  app: ElectronApplication,
  term: string,
  count: string
) => {
  const overlay = await findOverlayDocument(app);
  const bar = overlay.getByRole("search", { name: "Find in page" });
  const field = bar.getByRole("textbox", { name: "Find in page" });

  await app.evaluate(({ Menu, BrowserWindow }) => {
    Menu.getApplicationMenu()
      ?.getMenuItemById("tab.find")
      ?.click(undefined, BrowserWindow.getAllWindows()[0]);
  });
  await expect(field).toBeFocused();
  await field.fill(term);
  await expect(bar.getByText(count, { exact: true })).toBeVisible();
};

test("the find bar with matches and with none, and over the focused pane of a split", async ({
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
        selectedTabId: "c1",
      },
    ],
    selectedProfileId: "p",
  });

  const first = await launch(launchApp, userDataDir);

  await findPage(first.app, standIn.calendarUrl);
  await first.shell.mouse.move(700, 20);
  await findInPage(first.app, FIND_WORD, `1/${FIND_MATCHES}`);
  await shootEachWay(first.app, first.shell, "find");
  await findInPage(first.app, "nowhere in it", "0/0");
  await shootEachWay(first.app, first.shell, "find-none");
  await first.app.close();

  await writeState(
    userDataDir,
    withSplit(
      standIn,
      { direction: "row", children: [pane(0.5, "c1"), pane(0.5, "d1")] },
      "c1"
    )
  );

  const { app, shell } = await launch(launchApp, userDataDir);

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);
  await shell.mouse.move(700, 20);
  await findInPage(app, FIND_WORD, `1/${FIND_MATCHES}`);
  await shootEachWay(app, shell, "find-split");
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
  await openContextMenu(app, () =>
    shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { name: STAND_IN_TITLE, exact: true })
      .click({ button: "right" })
  );
  await chooseContextMenuItem(app, "Sleep");
  await expect(
    shell.getByRole("region", { name: `${STAND_IN_TITLE} is sleeping` })
  ).toBeVisible();
  await shell.mouse.move(700, 20);
  await shootEachWay(app, shell, "split-sleeping");
});

/**
 * Gmail, Drive and Meet pinned, then Calendar, Sheets, Drive and Slides,
 * with a split of each of `roots` and Calendar selected; no app has two
 * tabs that are not pinned, so the sidebar starts narrow. Only Gmail,
 * Calendar and Drive go in a pane that shows, whose stand-ins their apps
 * claim.
 */
const withBox = (standIn: StandIn, ...roots: unknown[]) => ({
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
      splits: roots.map((root) => ({ root })),
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

/** Rests the pointer on the middle of a tab, so it shows its hover. */
const hoverTab = async (shell: Page, tabId: string) => {
  const point = await shell.evaluate((id) => {
    const box = document
      .querySelector(`[data-split-box] [data-tab-id="${id}"]`)
      ?.getBoundingClientRect();

    return {
      x: (box?.left ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.top ?? 0) + (box?.height ?? 0) / 2,
    };
  }, tabId);

  await shell.mouse.move(point.x, point.y);
};

test("a split's box first in the list, its last tab hovered, narrow and wide", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(
    userDataDir,
    withBox(standIn, {
      direction: "row",
      children: [pane(0.5, "c1"), pane(0.5, "d1")],
    })
  );

  const { app, shell } = await launch(launchApp, userDataDir);
  const narrow = shell.getByRole("button", { name: "Narrow sidebar" });

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);

  if ((await narrow.count()) > 0) {
    await narrow.click();
  }

  await hoverTab(shell, "d1");
  await shootEachWay(app, shell, "split-box-hover-narrow");
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await expect(narrow).toHaveCount(1);
  await hoverTab(shell, "d1");
  await shootEachWay(app, shell, "split-box-hover-wide");
});

test("two splits' boxes, both in the list, and one in the pinned area with one in the list, narrow and wide", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const shown = {
    direction: "row",
    children: [pane(0.5, "c1"), pane(0.5, "d1")],
  };

  // Sheets and Slides never show, so never load Google's own pages.
  await writeState(
    userDataDir,
    withBox(standIn, shown, {
      direction: "row",
      children: [pane(0.5, "s"), pane(0.5, "l")],
    })
  );

  const first = await launch(launchApp, userDataDir);

  await findPage(first.app, standIn.calendarUrl);
  await findPage(first.app, standIn.driveUrl);
  await rest(first.shell);
  await shootEachWay(first.app, first.shell, "split-boxes-list-narrow");
  await first.shell.getByRole("button", { name: "Widen sidebar" }).click();
  await rest(first.shell);
  await shootEachWay(first.app, first.shell, "split-boxes-list-wide");
  await first.app.close();

  await writeState(
    userDataDir,
    withBox(standIn, shown, {
      direction: "row",
      children: [pane(0.5, "k2"), pane(0.5, "s")],
    })
  );

  const { app, shell } = await launch(launchApp, userDataDir);
  const narrow = shell.getByRole("button", { name: "Narrow sidebar" });

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);

  if ((await narrow.count()) > 0) {
    await narrow.click();
  }

  await rest(shell);
  await shootEachWay(app, shell, "split-boxes-pinned-narrow");
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await rest(shell);
  await shootEachWay(app, shell, "split-boxes-pinned-wide");
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
      splits: profile.splits.map((split) => ({ ...split, maximized: true })),
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

test("the bookmark toast with a 280-character title, cut to one line", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, withBookmarks(standIn));

  const { app, shell } = await launch(launchApp, userDataDir);
  const overlay = await findOverlayDocument(app);
  const calendar = await findPage(app, standIn.calendarUrl);
  const title = "Quarterly planning review ".repeat(11).slice(0, 280);

  expect(title).toHaveLength(280);
  await calendar.evaluate(
    ({ next }) => {
      history.pushState({}, "", "#long");
      document.title = next;
    },
    { next: title }
  );

  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one toast at a time
    await app.evaluate(({ Menu, BrowserWindow }) => {
      Menu.getApplicationMenu()
        ?.getMenuItemById("tab.bookmark")
        ?.click(undefined, BrowserWindow.getAllWindows()[0]);
    });
    // oxlint-disable-next-line no-await-in-loop -- one toast at a time
    await expect(
      overlay.getByText(`Bookmarked ${title}`, { exact: true })
    ).toBeVisible();
    // Lets the toast slide in.
    // oxlint-disable-next-line no-await-in-loop -- one toast at a time
    await delay(600);
    // oxlint-disable-next-line no-await-in-loop -- one toast at a time
    await shootWindow(app, shell, shotPath("toast-bookmarked-long", theme));
    // Removed again, so the next theme's press bookmarks it anew.
    // oxlint-disable-next-line no-await-in-loop -- one toast at a time
    await app.evaluate(({ Menu, BrowserWindow }) => {
      Menu.getApplicationMenu()
        ?.getMenuItemById("tab.bookmark")
        ?.click(undefined, BrowserWindow.getAllWindows()[0]);
    });
    // oxlint-disable-next-line no-await-in-loop -- one toast at a time
    await expect(
      overlay.getByText("Bookmark removed", { exact: true })
    ).toBeVisible();
  }
});

/** Calendar in its own window, Drive selected, in each named profile. */
const withOwnWindow = (standIn: StandIn, names: string[]) => ({
  profiles: names.map((name, index) => ({
    id: `p${index}`,
    name,
    tabs: [
      { id: "gmail", app: "gmail", url: standIn.url, title: "" },
      {
        id: "c",
        app: "calendar",
        url: standIn.calendarUrl,
        title: "",
        ...(index === 0 && {
          ownWindow: true,
          windowBounds: { x: 120, y: 120, width: 900, height: 600 },
        }),
      },
      { id: "d", app: "drive", url: standIn.driveUrl, title: "" },
    ],
    selectedTabId: "d",
  })),
  selectedProfileId: "p0",
});

/** Waits for the own window's page and its titlebar's title. */
const ownWindowDrawn = async (app: ElectronApplication) => {
  const titlebar = await findTitlebar(app);

  await expect(
    titlebar
      .getByRole("banner", { name: "Title bar" })
      .getByText(CALENDAR_TITLE)
  ).toBeVisible();
  await expect
    .poll(async () => {
      const [window] = await readOwnWindows(app);

      return window?.views.filter((view) => view.visible).length;
    })
    .toBe(2);

  return titlebar;
};

/** Shoots the own window as `surface` in each theme. */
const shootOwnWindowEachWay = async (
  app: ElectronApplication,
  shell: Page,
  surface: string
) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await shootOwnWindow(app, shell, shotPath(surface, theme));
  }
};

test("a tab in its own window with one profile and with two, and its mark in the sidebar narrow and wide", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, withOwnWindow(standIn, ["Default"]));

  const { app, shell } = await launch(launchApp, userDataDir);
  const titlebar = await ownWindowDrawn(app);

  await titlebar.mouse.move(600, 300);
  await shootOwnWindowEachWay(app, shell, "own-window");

  await rest(shell);
  await shootEachWay(app, shell, "own-window-mark-narrow");
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await rest(shell);
  await shootEachWay(app, shell, "own-window-mark-wide");
  await app.close();

  await writeState(userDataDir, withOwnWindow(standIn, ["Personal", "Work"]));

  const two = await launch(launchApp, userDataDir);
  const second = await ownWindowDrawn(two.app);

  await expect(
    second.getByRole("banner", { name: "Title bar" }).getByText("Personal")
  ).toBeVisible();
  await second.mouse.move(600, 300);
  await shootOwnWindowEachWay(two.app, two.shell, "own-window-two");
});

test("the find bar over a tab's page in its own window", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, withOwnWindow(standIn, ["Default"]));

  const { app, shell } = await launch(launchApp, userDataDir);
  const titlebar = await ownWindowDrawn(app);

  // A click on its tab gives its page the focus, and Cmd or Ctrl+F there
  // opens its bar, as the system hands the keys to it.
  await shell
    .getByRole("tablist", { name: "Tabs" })
    .getByRole("tab", { name: CALENDAR_TITLE, exact: true })
    .click();
  await app.evaluate(({ webContents }, url) => {
    const page = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL().startsWith(url));

    for (const type of ["keyDown", "keyUp"] as const) {
      page?.sendInputEvent({
        type,
        keyCode: "F",
        modifiers: [process.platform === "darwin" ? "meta" : "control"],
      });
    }
  }, standIn.calendarUrl);

  const document = await findWindowFind(app);
  const bar = document.getByRole("search", { name: "Find in page" });

  await bar.getByRole("textbox", { name: "Find in page" }).fill(FIND_WORD);
  await expect(
    bar.getByText(`1/${FIND_MATCHES}`, { exact: true })
  ).toBeVisible();
  await titlebar.mouse.move(600, 300);
  await shootOwnWindowEachWay(app, shell, "own-window-find");
});

/** Gmail, Calendar, selected, and Drive, Calendar's page bookmarked, with `more` after it. */
const withBookmarks = (standIn: StandIn, more: object[] = []) => ({
  profiles: [
    {
      id: "p",
      name: "Default",
      tabs: [
        { id: "gmail", app: "gmail", url: standIn.url, title: "" },
        { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
        { id: "d", app: "drive", url: standIn.driveUrl, title: "" },
      ],
      selectedTabId: "c",
      bookmarks: [
        {
          id: "b0",
          url: standIn.calendarUrl,
          title: CALENDAR_TITLE,
          app: "calendar",
        },
        ...more,
      ],
    },
  ],
  selectedProfileId: "p",
});

/** Runs a command from the application menu, as its shortcut would. */
const runMenuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu, BrowserWindow }, item) => {
    Menu.getApplicationMenu()
      ?.getMenuItemById(item)
      ?.click(undefined, BrowserWindow.getAllWindows()[0]);
  }, id);

test("the New tab launcher with its apps and bookmarks, filtered to bookmarks, with no results, and as Open in split", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(
    userDataDir,
    withBookmarks(standIn, [
      {
        id: "b1",
        url: "https://docs.google.com/document/d/plan/edit",
        title: "Q4 planning notes",
        app: "docs",
      },
      {
        id: "b2",
        url: "https://docs.google.com/spreadsheets/d/budget/edit",
        title: "Team budget 2026, with a title long enough to be cut short",
        app: "sheets",
      },
      {
        id: "b3",
        url: "https://drive.google.com/drive/folders/shared",
        title: "Shared with the design team",
        app: "drive",
      },
      {
        id: "b4",
        url: "https://meet.google.com/abc-defg-hij",
        title: "Weekly standup",
        app: "meet",
      },
    ])
  );

  const { app, shell } = await launch(launchApp, userDataDir);
  const overlay = await findOverlayDocument(app);
  const field = overlay.getByRole("combobox", { name: "New tab" });

  await findPage(app, standIn.calendarUrl);
  await rest(shell);
  await runMenuItem(app, "app.open");
  await expect(field).toBeFocused();
  await shootEachWay(app, shell, "new-tab-bookmarks");

  await field.fill("plan");
  await expect(overlay.getByRole("option")).toHaveText([/^Q4 planning/u]);
  await shootEachWay(app, shell, "new-tab-bookmarks-filtered");

  await field.fill("zz");
  await expect(overlay.getByText("No results.")).toBeVisible();
  await shootEachWay(app, shell, "new-tab-no-results");

  await runMenuItem(app, "app.open");
  await expect(overlay.getByRole("dialog")).toHaveCount(0);
  await runMenuItem(app, "tab.splitRight");
  await expect(
    overlay.getByRole("dialog", { name: "Open in split" })
  ).toBeVisible();
  await expect(overlay.getByText("Bookmarks", { exact: true })).toBeVisible();
  await shootEachWay(app, shell, "new-tab-split");
});

test("a wide row bookmarked at rest, and a row's bookmark button on hover", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, withBookmarks(standIn));

  const { app, shell } = await launch(launchApp, userDataDir);
  const tabs = shell.getByRole("tablist", { name: "Tabs" });

  await findPage(app, standIn.calendarUrl);
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  // Drive's page loads once shown, so its row can be bookmarked too.
  await tabs.getByRole("tab", { name: "Drive", exact: true }).click();
  await findPage(app, standIn.driveUrl);
  await tabs.getByRole("tab", { name: CALENDAR_TITLE, exact: true }).click();
  await rest(shell);
  await expect(
    shell.getByRole("button", {
      name: `Remove bookmark of ${CALENDAR_TITLE}`,
      includeHidden: true,
    })
  ).toHaveCSS("opacity", "1");
  await shootEachWay(app, shell, "bookmark-row");

  await tabs.getByRole("tab", { name: DRIVE_TITLE, exact: true }).hover();
  await expect(
    shell.getByRole("button", {
      name: `Bookmark ${DRIVE_TITLE}`,
      includeHidden: true,
    })
  ).toHaveCSS("opacity", "1");
  await shootEachWay(app, shell, "bookmark-row-hover");
});

test("a tab's own window with its page bookmarked", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const state = withOwnWindow(standIn, ["Default"]);

  await writeState(userDataDir, {
    ...state,
    profiles: state.profiles.map((profile) => ({
      ...profile,
      bookmarks: [
        {
          id: "b0",
          url: standIn.calendarUrl,
          title: CALENDAR_TITLE,
          app: "calendar",
        },
      ],
    })),
  });

  const { app, shell } = await launch(launchApp, userDataDir);
  const titlebar = await ownWindowDrawn(app);

  await expect(
    titlebar
      .getByRole("banner", { name: "Title bar" })
      .getByRole("button", { name: /^Remove bookmark/u })
  ).toBeVisible();
  await titlebar.mouse.move(600, 300);
  await shootOwnWindowEachWay(app, shell, "own-window-bookmark");
});
