import type { ElectronApplication, Page } from "@playwright/test";

import {
  expect,
  findPage,
  shownViews,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { DESIGNS, THEMES, onlyWithShots, shotPath } from "./lib/shots.ts";
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
    .getByRole("tablist", { name: "Profiles" })
    .getByRole("tab", { name: new RegExp(`^${name}`, "u") });

const grid = (shell: Page) =>
  shell.getByRole("grid", { name: "Unread messages" });

/** The subject of each row, top to bottom, from the cell that shows it with the summary. */
const subjects = async (shell: Page) => {
  const rows = await grid(shell).getByRole("row").all();

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

/**
 * Home and Work signed in with mail, Club signed out, Home selected; the
 * inbox is opened from the titlebar once every profile has been polled.
 */
const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn,
  settings?: object
) => {
  await writeState(userDataDir, {
    profiles: PROFILES,
    selectedProfileId: "p0",
  });

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

  return { app, shell };
};

const openInbox = async (shell: Page) => {
  await shell
    .getByRole("button", { name: "Unified inbox", exact: true })
    .click();
  await expect(grid(shell)).toBeVisible();
};

test("lists every profile's mail newest first in place of the tab, says which profile is signed out or has more, and closes from the menu", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const button = shell.getByRole("button", {
    name: "Unified inbox",
    exact: true,
  });

  standIn.setFeed("persist:p1", { unreadCount: 40, mail: WORK_MAIL });
  await pollAll(app);
  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 40 unread messages"
  );

  const gmailPages = standIn.requests().gmail;

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await openInbox(shell);

  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => subjects(shell))
    .toStrictEqual(["Subject a1", "Subject b2", "Subject a3"]);
  await expect(
    grid(shell).getByRole("row", { name: /Subject b2/u })
  ).toContainText("Work");
  await expect(shell.getByText("Club is signed out.")).toBeVisible();
  await expect(
    shell.getByText("Work: the newest 1 of 40 unread")
  ).toBeVisible();
  // The tab's view is hidden under it, still loaded.
  await expect.poll(() => shownViews(app)).toStrictEqual([]);
  // Opening put focus on the first row.
  await expect(grid(shell).getByRole("row").first()).toBeFocused();

  await app.evaluate(({ Menu, BrowserWindow }) => {
    Menu.getApplicationMenu()
      ?.getMenuItemById("inbox.toggle")
      ?.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
  });

  await expect(grid(shell)).toBeHidden();
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([{ url: standIn.url, partition: "persist:p0" }]);
  // Shown again without a reload.
  expect(standIn.requests().gmail).toBe(gmailPages);
});

test("opens a row's message in its profile's Gmail, selecting the profile", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);

  await openInbox(shell);
  await grid(shell)
    .getByRole("row", { name: /Subject b2/u })
    .click();

  await expect(grid(shell)).toBeHidden();
  await expect(profileTab(shell, "Work")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([
      { url: messageLink(standIn.url, "b2"), partition: "persist:p1" },
    ]);
});

test("removes a row an action runs on, sends it for the row's profile, and the count follows", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { shell } = await launch(launchApp, userDataDir, standIn);

  standIn.setFeedAfterAction("persist:p1", { unreadCount: 0, mail: [] });
  standIn.setFeedAfterAction("persist:p0", {
    unreadCount: 1,
    mail: [HOME_MAIL[0] as StandInMail],
  });
  await openInbox(shell);

  // Gmail's keys: down to Work's row, and e archives it.
  await shell.keyboard.press("j");
  await expect(
    grid(shell).getByRole("row", { name: /Subject b2/u })
  ).toBeFocused();
  await shell.keyboard.press("e");

  await expect
    .poll(() => subjects(shell))
    .toStrictEqual(["Subject a1", "Subject a3"]);
  // The row that took its place has the focus.
  await expect(
    grid(shell).getByRole("row", { name: /Subject a3/u })
  ).toBeFocused();
  await expect(profileTab(shell, "Work")).toHaveAccessibleName("Work");

  // And a row's button, for the pointer.
  const row = grid(shell).getByRole("row", { name: /Subject a3/u });

  await row.hover();
  await row.getByRole("button", { name: "Mark as read" }).click();

  await expect.poll(() => subjects(shell)).toStrictEqual(["Subject a1"]);
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
  const { shell } = await launch(launchApp, userDataDir, standIn);

  standIn.failActions("persist:p0");

  const release = standIn.holdActions();

  await openInbox(shell);
  await shell.keyboard.press("#");

  await expect
    .poll(() => standIn.refusedActions)
    .toStrictEqual([{ account: "persist:p0", code: 9, messageId: "a1" }]);
  await expect
    .poll(() => subjects(shell))
    .toStrictEqual(["Subject b2", "Subject a3"]);
  release();

  await expect(
    shell.getByText(
      "Couldn’t move the message to Trash. It’s back in the list."
    )
  ).toBeVisible();
  await expect
    .poll(() => subjects(shell))
    .toStrictEqual(["Subject a1", "Subject b2", "Subject a3"]);
  expect(standIn.actions).toStrictEqual([]);
});

test("shows the same list after the shell reloads, since main keeps it, and closes on Escape or the selected profile's tab", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const home = [{ url: standIn.url, partition: "persist:p0" }];

  await openInbox(shell);
  await shell.reload();

  await expect
    .poll(() => subjects(shell))
    .toStrictEqual(["Subject a1", "Subject b2", "Subject a3"]);
  await expect(
    shell.getByRole("button", { name: "Unified inbox", exact: true })
  ).toHaveAttribute("aria-pressed", "true");

  await expect(grid(shell).getByRole("row").first()).toBeFocused();
  await shell.keyboard.press("Escape");

  await expect(grid(shell)).toBeHidden();
  await expect.poll(() => shownViews(app)).toStrictEqual(home);

  // Asking for what is selected already shows it.
  await openInbox(shell);
  await profileTab(shell, "Home").click();

  await expect(grid(shell)).toBeHidden();
  await expect.poll(() => shownViews(app)).toStrictEqual(home);
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

for (const design of DESIGNS) {
  test(`draws the inbox in the ${design} design, light and dark`, async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    onlyWithShots();

    const { app, shell } = await launch(launchApp, userDataDir, standIn, {
      design,
      // A clear page, which a screenshot shows white, would hide the chrome.
      vibrancy: false,
    });

    standIn.setFeed("persist:p1", { unreadCount: 40, mail: SHOT_MAIL });
    await pollAll(app);
    await expect(profileTab(shell, "Work")).toHaveAccessibleName(
      "Work, 40 unread messages"
    );
    await openInbox(shell);
    await expect(grid(shell).getByRole("row")).toHaveCount(5);

    for (const theme of THEMES) {
      // The inbox is the shell's own, drawn where the tab's view would be.
      // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
      await shell.emulateMedia({ colorScheme: theme });
      // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
      await shell.screenshot({
        path: shotPath("inbox", design, theme),
        // Ends the colour transitions the scheme just started.
        animations: "disabled",
      });
    }
  });
}
