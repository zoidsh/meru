import type { ElectronApplication, Page } from "@playwright/test";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readMenuItem,
  readState,
  test,
  writeState,
} from "./lib/app.ts";
import { findTitlebar } from "./lib/own-window.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { CALENDAR_TITLE, DRIVE_TITLE, STAND_IN_TITLE } from "./lib/stand-in.ts";

const isMacOS = process.platform === "darwin";
const command = isMacOS ? ("meta" as const) : ("control" as const);

/** A shortcut pressed in the page at `url`, as the system hands keys to it. */
const press = (
  app: ElectronApplication,
  url: string,
  keyCode: string,
  modifiers: ("meta" | "control" | "alt")[]
) =>
  app.evaluate(
    ({ webContents }, request) => {
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(request.url));

      for (const type of ["keyDown", "keyUp"] as const) {
        page?.sendInputEvent({
          type,
          keyCode: request.keyCode,
          modifiers: request.modifiers,
        });
      }
    },
    { url, keyCode, modifiers }
  );

const pressBookmark = (app: ElectronApplication, url: string) =>
  press(app, url, "D", [command]);

const pressBookmarks = (app: ElectronApplication, url: string) =>
  press(app, url, "B", [command, "alt"]);

interface StoredBookmark {
  id: string;
  url: string;
  title: string;
  app: string;
}

interface Stored {
  profiles: {
    tabs: { id: string; app: string; url: string }[];
    selectedTabId: string;
    bookmarks?: StoredBookmark[];
  }[];
}

/** The first profile as `state.json` has it now. */
const readProfile = async (userDataDir: string) => {
  const { profiles } = await readState<Stored>(userDataDir);

  return profiles[0];
};

const readBookmarks = async (userDataDir: string) => {
  const profile = await readProfile(userDataDir);

  return profile?.bookmarks?.map(({ title, app }) => `${app} ${title}`) ?? [];
};

const readTabApps = async (userDataDir: string) => {
  const profile = await readProfile(userDataDir);

  return profile?.tabs.map(({ app }) => app);
};

/** Bookmark Tab's label and whether it is enabled, as the menu has it now. */
const readBookmarkItem = async (app: ElectronApplication) => {
  const { label, enabled } = await readMenuItem(app, "tab.bookmark");

  return { label, enabled };
};

/** Gmail, Calendar and Drive, with `fields` added to the profile. */
const seed = (userDataDir: string, standIn: StandIn, fields: object = {}) =>
  writeState(userDataDir, {
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
        ...fields,
      },
    ],
    selectedProfileId: "p",
  });

const tabs = (shell: Page) => shell.getByRole("tablist", { name: "Tabs" });

const tab = (shell: Page, name: string) =>
  tabs(shell).getByRole("tab", { name, exact: true });

/** The bookmark button on the tab's wide row, by the name it has now. */
const rowButton = (shell: Page, name: string) =>
  shell.getByRole("button", { name, exact: true, includeHidden: true });

// Away from every control, so no row shows its hover.
const rest = (shell: Page) => shell.mouse.move(700, 20);

test("Cmd or Ctrl+D bookmarks the selected tab's page with a toast and removes it with another, the wide row's button kept filled at rest while it is bookmarked, and offers nothing on Gmail", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);
  const notices = overlay.getByRole("region", { name: "Notifications" });

  await findPage(app, standIn.calendarUrl);
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await rest(shell);
  await expect
    .poll(() => readBookmarkItem(app))
    .toStrictEqual({ label: "Bookmark Tab", enabled: true });

  const unbookmarked = rowButton(shell, `Bookmark ${CALENDAR_TITLE}`);

  await expect(unbookmarked).toHaveCSS("opacity", "0");

  await pressBookmark(app, standIn.calendarUrl);
  await expect(
    notices.getByText(`Bookmarked ${CALENDAR_TITLE}`, { exact: true })
  ).toBeVisible();
  await expect
    .poll(() => readBookmarks(userDataDir))
    .toStrictEqual([`calendar ${CALENDAR_TITLE}`]);

  const bookmarked = rowButton(shell, `Remove bookmark of ${CALENDAR_TITLE}`);

  await expect(bookmarked).toHaveCSS("opacity", "1");
  await expect
    .poll(() => readBookmarkItem(app))
    .toStrictEqual({ label: "Remove Bookmark", enabled: true });

  // The stored URL is the tab's, exactly.
  const stored = await readProfile(userDataDir);

  expect(stored?.bookmarks?.[0]?.url).toBe(
    stored?.tabs.find(({ id }) => id === "c")?.url
  );

  await pressBookmark(app, standIn.calendarUrl);
  await expect(
    notices.getByText("Bookmark removed", { exact: true })
  ).toBeVisible();
  await expect.poll(() => readBookmarks(userDataDir)).toStrictEqual([]);
  await expect(unbookmarked).toHaveCSS("opacity", "0");

  await tab(shell, STAND_IN_TITLE).click();
  await expect
    .poll(() => readBookmarkItem(app))
    .toStrictEqual({ label: "Bookmark Tab", enabled: false });
  await expect(
    shell.getByRole("button", {
      name: new RegExp(
        `^(?:Bookmark|Remove bookmark of) ${STAND_IN_TITLE}`,
        "u"
      ),
      includeHidden: true,
    })
  ).toHaveCount(0);
});

test("Cmd or Ctrl+D right after the page moves within its document and retitles bookmarks it where it is now, and back at the first page, its title back too, adds that rather than removing the other", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const overlay = await findOverlayDocument(app);
  const notices = overlay.getByRole("region", { name: "Notifications" });
  const calendar = await findPage(app, standIn.calendarUrl);
  const first = calendar.url();
  const later = new URL("#later", first).href;

  await expect
    .poll(() => readBookmarkItem(app))
    .toStrictEqual({ label: "Bookmark Tab", enabled: true });
  await calendar.evaluate(() => {
    history.pushState({}, "", "#later");
    document.title = "Later";
  });
  await pressBookmark(app, standIn.calendarUrl);
  await expect(
    notices.getByText("Bookmarked Later", { exact: true })
  ).toBeVisible();
  await expect
    .poll(() => readBookmarkItem(app))
    .toStrictEqual({ label: "Remove Bookmark", enabled: true });

  await calendar.evaluate(() => {
    history.back();
  });
  await expect
    .poll(() => readBookmarkItem(app))
    .toStrictEqual({ label: "Bookmark Tab", enabled: true });
  await pressBookmark(app, standIn.calendarUrl);
  await expect
    .poll(async () => {
      const profile = await readProfile(userDataDir);

      return profile?.bookmarks?.map(({ url, title }) => [url, title]);
    })
    .toStrictEqual([
      [later, "Later"],
      [first, CALENDAR_TITLE],
    ]);
});

test("Cmd or Ctrl+D with the find bar open bookmarks the page without a toast, the bar left open", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);
  const bar = overlay.getByRole("search", { name: "Find in page" });

  await findPage(app, standIn.calendarUrl);
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await expect
    .poll(() => readBookmarkItem(app))
    .toStrictEqual({ label: "Bookmark Tab", enabled: true });
  await clickMenuItem(app, "tab.find");
  await expect(bar).toBeVisible();
  await pressBookmark(app, standIn.calendarUrl);
  await expect
    .poll(() => readBookmarks(userDataDir))
    .toStrictEqual([`calendar ${CALENDAR_TITLE}`]);
  await expect
    .poll(() => readBookmarkItem(app))
    .toStrictEqual({ label: "Remove Bookmark", enabled: true });
  await expect(
    rowButton(shell, `Remove bookmark of ${CALENDAR_TITLE}`)
  ).toHaveCount(1);
  await expect(bar).toBeVisible();
  await expect(
    overlay.getByRole("region", { name: "Notifications" })
  ).toHaveCount(0);
});

test("the wide row's bookmark button shows on hover and bookmarks that row's page, not the selected tab's", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.calendarUrl);
  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await rest(shell);

  // Drive's page loads once it is first shown, and names its tab.
  await tab(shell, "Drive").click();
  await findPage(app, standIn.driveUrl);
  await expect(tab(shell, DRIVE_TITLE)).toBeVisible();
  await tab(shell, CALENDAR_TITLE).click();

  const drive = rowButton(shell, `Bookmark ${DRIVE_TITLE}`);

  await tab(shell, DRIVE_TITLE).hover();
  await expect(drive).toHaveCSS("opacity", "1");
  await drive.click();
  await expect
    .poll(() => readBookmarks(userDataDir))
    .toStrictEqual([`drive ${DRIVE_TITLE}`]);
  await rest(shell);
  await expect(rowButton(shell, `Remove bookmark of ${DRIVE_TITLE}`)).toHaveCSS(
    "opacity",
    "1"
  );
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

test("Bookmarks lists the profile's bookmarks, opens one with the keyboard or the pointer, selecting a tab already at its page or opening a new one, and removes one in place with either", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn, {
    tabs: [
      { id: "gmail", app: "gmail", url: standIn.url, title: "" },
      { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
    ],
    selectedTabId: "gmail",
    bookmarks: [
      { id: "b1", url: standIn.calendarUrl, title: "Week", app: "calendar" },
      { id: "b2", url: standIn.driveUrl, title: "Files", app: "drive" },
      { id: "b3", url: `${standIn.driveUrl}#x`, title: "Shared", app: "drive" },
    ],
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);
  const card = overlay.getByRole("dialog", { name: "Bookmarks" });
  const rows = card.getByRole("option");
  const inCard = () =>
    overlay.evaluate(() => document.activeElement?.closest("dialog") !== null);

  await findPage(app, standIn.url);
  await pressBookmarks(app, standIn.url);
  await expect(card).toBeVisible();
  await expect(rows).toHaveText([
    /^Week\s*Calendar/u,
    /^Files\s*Drive/u,
    /^Shared\s*Drive/u,
  ]);
  await expect.poll(inCard).toBe(true);

  await overlay.keyboard.press("ArrowDown");
  await expect(card.getByRole("option", { selected: true })).toHaveText(
    /^Files/u
  );
  await overlay.keyboard.press("Enter");
  await findPage(app, standIn.driveUrl);
  await expect(card).toHaveCount(0);
  await expect
    .poll(() => readTabApps(userDataDir))
    .toStrictEqual(["gmail", "calendar", "drive"]);

  // The titlebar's button opens it too; the keyboard removes in place.
  await shell.getByRole("button", { name: "Bookmarks" }).click();
  await expect(card).toBeVisible();
  await overlay.keyboard.press("ArrowDown");
  await overlay.keyboard.press("ArrowDown");
  await overlay.keyboard.press("Delete");
  await expect(rows).toHaveText([/^Week/u, /^Files/u]);
  await expect(card).toBeVisible();
  await expect.poll(inCard).toBe(true);
  await expect(card.getByRole("option", { selected: true })).toHaveText(
    /^Files/u
  );

  // The pointer removes with the row's cross, keeping the card and its focus.
  await rows.filter({ hasText: "Files" }).hover();
  await card
    .getByRole("option", { name: /Files/u })
    .getByRole("button", { name: "Remove bookmark" })
    .click();
  await expect(rows).toHaveText([/^Week/u]);
  await expect.poll(inCard).toBe(true);
  await expect
    .poll(() => readBookmarks(userDataDir))
    .toStrictEqual(["calendar Week"]);

  // A tab already at the page is selected rather than another opened.
  await rows.filter({ hasText: "Week" }).click();
  await expect(card).toHaveCount(0);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  expect(await readTabApps(userDataDir)).toStrictEqual([
    "gmail",
    "calendar",
    "drive",
  ]);

  // A second press closes it.
  await clickMenuItem(app, "bookmarks.toggle");
  await expect(card).toBeVisible();
  await clickMenuItem(app, "bookmarks.toggle");
  await expect(card).toHaveCount(0);
});

test("Bookmarks with none says how to add one", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const overlay = await findOverlayDocument(app);
  const card = overlay.getByRole("dialog", { name: "Bookmarks" });

  await findPage(app, standIn.calendarUrl);
  await clickMenuItem(app, "bookmarks.toggle");
  await expect(card.getByText("No bookmarks yet")).toBeVisible();
  await expect(
    card.getByText("Bookmark a page from its tab's menu or with the shortcut.")
  ).toBeVisible();
  await expect(card.getByRole("option")).toHaveCount(0);
  await overlay.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
});

test("a tab's own window shows its star first in the titlebar's right group, which bookmarks its page, filled, and Cmd or Ctrl+D there removes it", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn, {
    tabs: [
      { id: "gmail", app: "gmail", url: standIn.url, title: "" },
      {
        id: "c",
        app: "calendar",
        url: standIn.calendarUrl,
        title: "",
        ownWindow: true,
        windowBounds: { x: 120, y: 120, width: 900, height: 600 },
      },
      { id: "d", app: "drive", url: standIn.driveUrl, title: "" },
    ],
    selectedTabId: "d",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);
  const titlebar = await findTitlebar(app);
  const bar = titlebar.getByRole("banner", { name: "Title bar" });

  await findPage(app, standIn.calendarUrl);
  // Once the page has named the tab, which the bookmark takes its title from.
  await expect(bar.getByText(CALENDAR_TITLE)).toBeVisible();
  await bar.getByRole("button", { name: /^Bookmark tab/u }).click();
  await expect
    .poll(() => readBookmarks(userDataDir))
    .toStrictEqual([`calendar ${CALENDAR_TITLE}`]);
  await expect(
    bar.getByRole("button", { name: /^Remove bookmark/u })
  ).toBeVisible();

  // Its tab brings the window forward, so the keys there are its own.
  await tab(shell, CALENDAR_TITLE).click();
  await pressBookmark(app, standIn.calendarUrl);
  await expect.poll(() => readBookmarks(userDataDir)).toStrictEqual([]);
  await expect(
    bar.getByRole("button", { name: /^Bookmark tab/u })
  ).toBeVisible();
  // The star is what tells of it there; the main window shows no toast.
  await expect(
    overlay.getByRole("region", { name: "Notifications" })
  ).toHaveCount(0);
});

test("bookmarks outlast a restart", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const first = await launchApp();
  const shell = await findPage(first, "meru-app:");

  await findPage(first, standIn.calendarUrl);
  await expect(tab(shell, CALENDAR_TITLE)).toBeVisible();
  await expect
    .poll(() => readBookmarkItem(first))
    .toStrictEqual({ label: "Bookmark Tab", enabled: true });
  await clickMenuItem(first, "tab.bookmark");
  await expect
    .poll(() => readBookmarks(userDataDir))
    .toStrictEqual([`calendar ${CALENDAR_TITLE}`]);
  await first.close();

  const second = await launchApp();
  const overlay = await findOverlayDocument(second);

  await findPage(second, standIn.calendarUrl);
  await clickMenuItem(second, "bookmarks.toggle");
  await expect(
    overlay.getByRole("dialog", { name: "Bookmarks" }).getByRole("option")
  ).toHaveText([new RegExp(`^${CALENDAR_TITLE}\\s*Calendar`, "u")]);
});
