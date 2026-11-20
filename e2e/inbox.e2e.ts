import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import {
  clickMenuItem,
  expect,
  findPage,
  findOverlayDocument,
  isDrawn,
  readListHighlight,
  readState,
  shownViews,
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
import type { StandIn, StandInMail } from "./lib/stand-in.ts";
import { messageLink, signIn } from "./lib/stand-in.ts";

const PROFILES = [
  { id: "p0", name: "Home" },
  { id: "p1", name: "Work" },
  { id: "p2", name: "Club" },
];

const mail = (id: string, issued: string): StandInMail => ({
  id,
  subject: `Subject ${id}`,
  summary: `Summary ${id}`,
  senderName: `Sender ${id}`,
  senderAddress: `${id}@example.com`,
  issued,
});

const HOME_MAIL = [
  mail("a1", "2026-11-17T10:00:00Z"),
  mail("a3", "2026-11-17T08:00:00Z"),
];
const WORK_MAIL = [mail("b2", "2026-11-17T09:00:00Z")];

/** Waking polls every profile at once. */
const pollAll = (app: ElectronApplication) =>
  app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });

const profileTab = (shell: Page, name: string) =>
  shell
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: new RegExp(`^${name}`, "u") });

const inboxButton = (shell: Page) =>
  shell.getByRole("button", { name: "Unified inbox", exact: true });

const grid = (overlay: Page) =>
  overlay
    .getByRole("dialog", { name: "Unified inbox" })
    .getByRole("grid", { name: "Unread messages" });

/** The subject of each row, top to bottom, from the cell that shows it with the summary. */
const subjects = async (overlay: Page) => {
  const rows = await grid(overlay).getByRole("row").all();

  return Promise.all(
    rows.map((row) =>
      row
        .getByRole("gridcell")
        .nth(2)
        .getByText(/^Subject /u)
        .textContent()
    )
  );
};

/** The overlay's view, which the shell opened and draws the inbox in. */
const overlayShown = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    // A crashed page's frame throws when read.
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in main, which sees nothing outside
    const nameOf = (view: Electron.View) => {
      try {
        return (view as Electron.WebContentsView).webContents?.mainFrame.name;
      } catch {
        return "";
      }
    };

    return (window?.contentView.children ?? []).some(
      (view) =>
        nameOf(view) === "meru-overlay" &&
        view.getVisible() &&
        view.getBounds().width > 400
    );
  });

/**
 * Home and Work signed in with mail, Club signed out, Home selected; the
 * inbox is opened from the titlebar once every profile has been polled.
 */
const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn,
  settings?: object,
  profiles: object[] = PROFILES
) => {
  await writeState(userDataDir, { profiles, selectedProfileId: "p0" });

  if (settings) {
    await writeSettings(userDataDir, settings);
  }

  standIn.setFeed("persist:p0", { unreadCount: 2, mail: HOME_MAIL });
  standIn.setFeed("persist:p1", { unreadCount: 1, mail: WORK_MAIL });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.url);
  await signIn(app, standIn, "p0");
  await signIn(app, standIn, "p1");
  await pollAll(app);
  await expect(profileTab(shell, "Home")).toHaveAccessibleName(
    "Home, 2 unread messages"
  );
  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 1 unread message"
  );

  return { app, shell, overlay: await findOverlayDocument(app) };
};

const openInbox = async (shell: Page, overlay: Page) => {
  await inboxButton(shell).click();
  await expect(grid(overlay)).toBeVisible();
};

test("lists every profile's mail newest first in an overlay over the page, says which profile has more, names no signed-out one, and closes from the menu", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, overlay } = await launch(launchApp, userDataDir, standIn);
  const home = [{ url: standIn.url, partition: "persist:p0" }];

  standIn.setFeed("persist:p1", { unreadCount: 40, mail: WORK_MAIL });
  await pollAll(app);
  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 40 unread messages"
  );

  await expect(inboxButton(shell)).toHaveAttribute("aria-pressed", "false");
  await openInbox(shell, overlay);

  await expect(inboxButton(shell)).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => subjects(overlay))
    .toStrictEqual(["Subject a1", "Subject b2", "Subject a3"]);
  await expect(
    grid(overlay).getByRole("row", { name: /Subject b2/u })
  ).toContainText("Work");
  await expect(overlay.getByText(/Club/u)).toHaveCount(0);
  await expect(
    overlay.getByText("Work: the newest 1 of 40 unread")
  ).toBeVisible();
  // The page stays in view under it, and Reload stays live for it.
  expect(await overlayShown(app)).toBeTruthy();
  await expect.poll(() => shownViews(app)).toStrictEqual(home);
  await expect(shell.getByRole("button", { name: "Reload" })).toBeEnabled();
  // Opening put focus on the first row.
  await expect(grid(overlay).getByRole("row").first()).toBeFocused();

  await clickMenuItem(app, "inbox.toggle");

  await expect(grid(overlay)).toBeHidden();
  await expect.poll(() => overlayShown(app)).toBeFalsy();
  await expect(shell.getByRole("button", { name: "Reload" })).toBeEnabled();
});

test("reloads the page under it, as under any other overlay, and stays open", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, overlay } = await launch(launchApp, userDataDir, standIn);
  const gmail = await findPage(app, standIn.url);

  standIn.setFeed("persist:p1", { unreadCount: 1, mail: WORK_MAIL });
  await pollAll(app);
  await openInbox(shell, overlay);
  await expect(shell.getByRole("button", { name: "Reload" })).toBeEnabled();

  await gmail.evaluate(() => Reflect.set(window, "kept", true));
  await clickMenuItem(app, "tab.reload");
  await expect
    .poll(() =>
      gmail
        .evaluate(() => Reflect.get(window, "kept") === true)
        // Asked while the page reloads.
        .catch(() => true)
    )
    .toBe(false);
  await expect(grid(overlay)).toBeVisible();
  expect(await overlayShown(app)).toBeTruthy();
});

/** The empty inbox: before any feed has been read, and once one read none unread. */
const emptyTitle = (overlay: Page, title: string) =>
  overlay.getByRole("dialog", { name: "Unified inbox" }).getByText(title);

test("says it has no mail to show yet while no profile's feed has been read, and that nothing is unread once one has", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, {
    profiles: PROFILES,
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);

  await findPage(app, standIn.url);
  // An empty grid has no height, so the open card is told by its words.
  await inboxButton(shell).click();
  await expect(emptyTitle(overlay, "No mail to show yet")).toBeVisible();
  await expect(grid(overlay)).toHaveAccessibleDescription(
    "No mail to show yet Unread mail appears here once a profile is signed in to Gmail."
  );
  await expect(emptyTitle(overlay, "No unread messages")).toHaveCount(0);

  standIn.setFeed("persist:p0", { unreadCount: 0, mail: [] });
  await signIn(app, standIn, "p0");
  await pollAll(app);

  await expect(emptyTitle(overlay, "No unread messages")).toBeVisible();
  await expect(emptyTitle(overlay, "No mail to show yet")).toHaveCount(0);
});

test("opens the selected row's message with Enter in its profile's Gmail, selecting the profile, and a click opens one too", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, overlay } = await launch(launchApp, userDataDir, standIn);

  await openInbox(shell, overlay);
  await overlay.keyboard.press("ArrowDown");
  await expect(
    grid(overlay).getByRole("row", { name: /Subject b2/u })
  ).toBeFocused();
  await overlay.keyboard.press("Enter");

  await expect(grid(overlay)).toBeHidden();
  await expect(profileTab(shell, "Work")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([
      { url: messageLink(standIn.url, "b2"), partition: "persist:p1" },
    ]);

  await openInbox(shell, overlay);
  await grid(overlay)
    .getByRole("row", { name: /Subject a3/u })
    .click();

  await expect(grid(overlay)).toBeHidden();
  await expect(profileTab(shell, "Home")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([
      { url: messageLink(standIn.url, "a3"), partition: "persist:p0" },
    ]);
});

test("moves the one selected row to the pointer as it moves over a row, showing only that row's actions, keeping it as the pointer leaves and as the keys go on from there", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { shell, overlay } = await launch(launchApp, userDataDir, standIn);
  const list = grid(overlay);
  const inboxRow = (subject: string) =>
    list.getByRole("row", { name: new RegExp(subject, "u") });

  await openInbox(shell, overlay);
  await expect
    .poll(() => subjects(overlay))
    .toStrictEqual(["Subject a1", "Subject b2", "Subject a3"]);
  expect(await readListHighlight(list)).toStrictEqual({
    selected: [0],
    filled: [0],
  });

  // The pointer arrives in the card; the first move a page hears tells no
  // movement, as Chromium's own made-up moves do not.
  await overlay.mouse.move(4, 4);
  await inboxRow("Subject a3").hover();
  await expect(inboxRow("Subject a3")).toBeFocused();
  expect(await readListHighlight(list)).toStrictEqual({
    selected: [2],
    filled: [2],
  });
  await expect
    .poll(() =>
      isDrawn(inboxRow("Subject a3").getByRole("button", { name: "Archive" }))
    )
    .toBe(true);
  await expect
    .poll(() =>
      isDrawn(inboxRow("Subject a1").getByRole("button", { name: "Archive" }))
    )
    .toBe(false);

  await overlay.mouse.move(4, 4);
  expect(await readListHighlight(list)).toStrictEqual({
    selected: [2],
    filled: [2],
  });

  await inboxRow("Subject a1").hover();
  await overlay.keyboard.press("ArrowDown");
  await expect(inboxRow("Subject b2")).toBeFocused();
  // The pointer, still over the first row, takes nothing back.
  await delay(200);
  expect(await readListHighlight(list)).toStrictEqual({
    selected: [1],
    filled: [1],
  });
});

test("opens a row's message in Gmail where its profile's Gmail was closed", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, overlay } = await launch(
    launchApp,
    userDataDir,
    standIn,
    undefined,
    PROFILES.map((profile) =>
      profile.id === "p1"
        ? { ...profile, tabs: [], selectedTabId: "" }
        : profile
    )
  );

  await openInbox(shell, overlay);
  await grid(overlay)
    .getByRole("row", { name: /Subject b2/u })
    .click();

  await expect(grid(overlay)).toBeHidden();
  await expect(profileTab(shell, "Work")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([
      { url: messageLink(standIn.url, "b2"), partition: "persist:p1" },
    ]);
  await expect
    .poll(async () => {
      const { profiles } = await readState<{
        profiles: { tabs?: { id: string }[]; selectedTabId?: string }[];
      }>(userDataDir);

      return [
        profiles[1]?.tabs?.map((tab) => tab.id),
        profiles[1]?.selectedTabId,
      ];
    })
    .toStrictEqual([["gmail"], "gmail"]);
});

test("removes a row an action runs on, sends it for the row's profile, and the count follows", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { shell, overlay } = await launch(launchApp, userDataDir, standIn);

  standIn.setFeedAfterAction("persist:p1", { unreadCount: 0, mail: [] });
  standIn.setFeedAfterAction("persist:p0", {
    unreadCount: 1,
    mail: [HOME_MAIL[0] as StandInMail],
  });
  await openInbox(shell, overlay);

  // Gmail's keys: down to Work's row, and e archives it.
  await overlay.keyboard.press("j");
  await expect(
    grid(overlay).getByRole("row", { name: /Subject b2/u })
  ).toBeFocused();
  await overlay.keyboard.press("e");

  await expect
    .poll(() => subjects(overlay))
    .toStrictEqual(["Subject a1", "Subject a3"]);
  // The row that took its place has the focus.
  await expect(
    grid(overlay).getByRole("row", { name: /Subject a3/u })
  ).toBeFocused();
  await expect(profileTab(shell, "Work")).toHaveAccessibleName("Work");

  // And a row's button, for the pointer.
  const row = grid(overlay).getByRole("row", { name: /Subject a3/u });

  await row.hover();
  await row.getByRole("button", { name: "Mark as read" }).click();

  await expect.poll(() => subjects(overlay)).toStrictEqual(["Subject a1"]);
  await expect(profileTab(shell, "Home")).toHaveAccessibleName(
    "Home, 1 unread message"
  );
  expect(standIn.actions).toStrictEqual([
    { account: "persist:p1", code: 1, messageId: "b2" },
    { account: "persist:p0", code: 3, messageId: "a3" },
  ]);
});

test("hides a row while its action runs, then puts it back when Gmail refuses it, and says so", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { shell, overlay } = await launch(launchApp, userDataDir, standIn);

  standIn.failActions("persist:p0");

  const release = standIn.holdActions();

  await openInbox(shell, overlay);
  await overlay.keyboard.press("#");

  await expect
    .poll(() => standIn.refusedActions)
    .toStrictEqual([{ account: "persist:p0", code: 9, messageId: "a1" }]);
  await expect
    .poll(() => subjects(overlay))
    .toStrictEqual(["Subject b2", "Subject a3"]);
  release();

  await expect(
    overlay.getByText(
      "Couldn’t move the message to Trash. It’s back in the list."
    )
  ).toBeVisible();
  await expect
    .poll(() => subjects(overlay))
    .toStrictEqual(["Subject a1", "Subject b2", "Subject a3"]);
  expect(standIn.actions).toStrictEqual([]);
});

test("closes as the shell reloads, which takes the overlay's document with it, and on Escape, a second click on its button, or the selected profile's button", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const {
    app,
    shell,
    overlay: first,
  } = await launch(launchApp, userDataDir, standIn);

  await openInbox(shell, first);
  await shell.reload();

  const overlay = await findOverlayDocument(app);

  await expect(inboxButton(shell)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => overlayShown(app)).toBeFalsy();

  await openInbox(shell, overlay);
  await expect
    .poll(() => subjects(overlay))
    .toStrictEqual(["Subject a1", "Subject b2", "Subject a3"]);
  await expect(grid(overlay).getByRole("row").first()).toBeFocused();
  await overlay.keyboard.press("Escape");

  await expect(grid(overlay)).toBeHidden();
  await expect.poll(() => overlayShown(app)).toBeFalsy();

  // Its button closes what it opened rather than opening it again.
  await openInbox(shell, overlay);
  await inboxButton(shell).click();

  await expect(grid(overlay)).toBeHidden();
  await expect(inboxButton(shell)).toHaveAttribute("aria-pressed", "false");

  // Asking for what is selected already shows it.
  await openInbox(shell, overlay);
  await profileTab(shell, "Home").click();

  await expect(grid(overlay)).toBeHidden();
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([{ url: standIn.url, partition: "persist:p0" }]);
});

/** Rows that stretch a row: a long subject and sender, a right-to-left subject, no summary. */
const SHOT_MAIL: StandInMail[] = [
  {
    id: "c1",
    subject:
      "Quarterly planning: agenda, the budget review, hiring for the platform team and everything we did not get to last time",
    summary: "Hi all, before Thursday please read the attached notes and add",
    senderName: "Alexandra Konstantinidou-Featherstonehaugh",
    senderAddress: "alexandra.konstantinidou@example.com",
    issued: new Date(Date.now() - 60 * 60_000).toISOString(),
  },
  {
    id: "c2",
    subject: "שלום, הפגישה נדחתה ליום שלישי",
    summary: "נתראה בשבוע הבא",
    senderName: "דנה לוי",
    senderAddress: "dana@example.com",
    issued: "2026-11-02T09:00:00Z",
  },
  {
    id: "c3",
    subject: "Your receipt",
    summary: "",
    senderName: "",
    senderAddress: "receipts@example.com",
    issued: "2025-06-30T09:00:00Z",
  },
];

test("draws the empty inbox before and after a feed has been read, light and dark", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  onlyWithShots();

  await writeState(userDataDir, {
    profiles: PROFILES,
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);

  await findPage(app, standIn.url);
  // An empty grid has no height, so the open card is told by its words.
  await inboxButton(shell).click();
  await expect(emptyTitle(overlay, "No mail to show yet")).toBeVisible();

  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await shootWindow(
      app,
      shell,
      shotPath("inbox-empty-unread-unknown", theme)
    );
  }

  standIn.setFeed("persist:p0", { unreadCount: 0, mail: [] });
  await signIn(app, standIn, "p0");
  await pollAll(app);
  await expect(emptyTitle(overlay, "No unread messages")).toBeVisible();

  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await shootWindow(app, shell, shotPath("inbox-empty", theme));
  }
});

test("draws the inbox, light and dark", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  onlyWithShots();

  const { app, shell, overlay } = await launch(launchApp, userDataDir, standIn);

  standIn.setFeed("persist:p1", { unreadCount: 40, mail: SHOT_MAIL });
  await pollAll(app);
  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 40 unread messages"
  );
  await openInbox(shell, overlay);
  await expect(grid(overlay).getByRole("row")).toHaveCount(5);
  // Away from the rows, so none shows its actions.
  await overlay.mouse.move(4, 4);

  for (const theme of THEMES) {
    // The inbox's overlay over the page, as the window shows both.
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await shootWindow(app, shell, shotPath("inbox", theme));
  }
});
