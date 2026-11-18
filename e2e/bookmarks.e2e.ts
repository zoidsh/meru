import type { ElectronApplication, Page } from "@playwright/test";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readMenuItem,
  readState,
  sizeWindow,
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
    splits?: unknown[];
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

/** Gmail and Calendar, Gmail selected, with three bookmarks and `fields`. */
const seedLauncher = (
  userDataDir: string,
  standIn: StandIn,
  fields: object = {}
) =>
  seed(userDataDir, standIn, {
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
    ...fields,
  });

/** New tab's card, field, options and groups in the overlay's document. */
const launcher = (overlay: Page, name = "New tab") => {
  const card = overlay.getByRole("dialog", { name });

  return {
    card,
    field: card.getByRole("combobox"),
    options: card.getByRole("option"),
    apps: card.getByRole("group", { name: "Apps" }),
    bookmarks: card.getByRole("group", { name: "Bookmarks" }),
    selected: card.getByRole("option", { selected: true }),
  };
};

const APP_NAMES = ["Calendar", "Drive", "Docs", "Sheets", "Slides", "Meet"];

test("New tab lists the apps, then the profile's bookmarks; typing filters both, a bookmark by its title or its app's name, a group with no match gone with its heading, and No results with none; one keyboard list runs across both", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedLauncher(userDataDir, standIn);

  const app = await launchApp();
  const overlay = await findOverlayDocument(app);
  const { card, field, options, apps, bookmarks, selected } = launcher(overlay);

  await findPage(app, standIn.url);
  await clickMenuItem(app, "app.open");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("placeholder", "Open app or bookmark");
  await expect(apps.getByRole("option")).toHaveText(APP_NAMES);
  await expect(bookmarks.getByRole("option")).toHaveText([
    /^Week\s*Calendar$/u,
    /^Files\s*Drive$/u,
    /^Shared\s*Drive$/u,
  ]);

  // Home first, since the pointer resting over the card may have
  // highlighted a row; then down past the last app to the first bookmark.
  await field.press("Home");
  await expect(selected).toHaveText("Calendar");
  for (const _name of APP_NAMES) {
    // oxlint-disable-next-line no-await-in-loop -- one key at a time
    await field.press("ArrowDown");
  }

  await expect(selected).toHaveText(/^Week/u);
  await expect(card.getByText("Bookmarks", { exact: true })).toBeInViewport();
  await field.press("ArrowUp");
  await expect(selected).toHaveText("Meet");

  await field.fill("drive");
  await expect(apps.getByRole("option")).toHaveText(["Drive"]);
  await expect(bookmarks.getByRole("option")).toHaveText([
    /^Files/u,
    /^Shared/u,
  ]);

  await field.fill("WEEK");
  await expect(apps).toHaveCount(0);
  await expect(card.getByText("Apps", { exact: true })).toHaveCount(0);
  await expect(options).toHaveText([/^Week/u]);

  await field.fill("zz");
  await expect(card.getByText("No results.", { exact: true })).toBeVisible();
  await expect(apps).toHaveCount(0);
  await expect(bookmarks).toHaveCount(0);
});

test("New tab's list grows to 480px and, in a short window, stops 16px above the page area's bottom, scrolling", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedLauncher(userDataDir, standIn, {
    bookmarks: Array.from({ length: 20 }, (_, index) => ({
      id: `b${index}`,
      url: `${standIn.calendarUrl}#${index}`,
      title: `Week ${index}`,
      app: "calendar",
    })),
  });

  const app = await launchApp();
  const overlay = await findOverlayDocument(app);
  const { card, field } = launcher(overlay);
  const measure = () =>
    overlay.evaluate(() => {
      const dialog = document.querySelector("dialog");
      const list = document.querySelector("[cmdk-list]");

      return {
        list: list?.getBoundingClientRect().height ?? 0,
        scrolls: list ? list.scrollHeight > list.clientHeight : false,
        gap: innerHeight - (dialog?.getBoundingClientRect().bottom ?? 0),
      };
    });

  await findPage(app, standIn.url);
  await sizeWindow(app, 1000, 720);
  await clickMenuItem(app, "app.open");
  await expect(field).toBeFocused();
  await expect
    .poll(async () => {
      const { list } = await measure();

      return list;
    })
    .toBe(480);

  await clickMenuItem(app, "app.open");
  await expect(card).toHaveCount(0);
  await sizeWindow(app, 1000, 480);
  await clickMenuItem(app, "app.open");
  await expect(field).toBeFocused();

  const short = await measure();

  expect(short.list).toBeLessThan(480);
  expect(short.scrolls).toBeTruthy();
  expect(short.gap).toBeGreaterThanOrEqual(16);
});

test("choosing a bookmark in New tab closes it and selects the tab at its page, brings forward the window of one in its own, or opens a new tab of its app", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedLauncher(userDataDir, standIn, {
    tabs: [
      { id: "gmail", app: "gmail", url: standIn.url, title: "" },
      { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
      {
        id: "d",
        app: "drive",
        url: standIn.driveUrl,
        title: "",
        ownWindow: true,
        windowBounds: { x: 120, y: 120, width: 900, height: 600 },
      },
    ],
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const overlay = await findOverlayDocument(app);
  const { card, field, options } = launcher(overlay);

  await findPage(app, standIn.url);
  await findPage(app, standIn.driveUrl);

  // A new tab where no tab is at the page, the keyboard choosing.
  await clickMenuItem(app, "app.open");
  await field.fill("shared");
  await field.press("Enter");
  await expect(card).toHaveCount(0);
  await findPage(app, `${standIn.driveUrl}#x`);
  await expect
    .poll(() => readTabApps(userDataDir))
    .toStrictEqual(["gmail", "calendar", "drive", "drive"]);

  // The tab already at the page, by the pointer.
  await clickMenuItem(app, "app.open");
  await options.filter({ hasText: "Week" }).click();
  await expect(card).toHaveCount(0);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );

  // The tab in its own window, whose window comes forward and opens
  // nothing new. Move to Main Window acts on the own window that has the
  // focus, so it is enabled once that window is the one shown, as it is not
  // while the card holds the main window's focus.
  await clickMenuItem(app, "app.open");
  await expect
    .poll(async () => {
      const { enabled } = await readMenuItem(app, "tab.moveToMainWindow");

      return enabled;
    })
    .toBeFalsy();
  await options.filter({ hasText: "Files" }).click();
  await expect(card).toHaveCount(0);
  await expect
    .poll(async () => {
      const { enabled } = await readMenuItem(app, "tab.moveToMainWindow");

      return enabled;
    })
    .toBeTruthy();
  expect(await readTabApps(userDataDir)).toStrictEqual([
    "gmail",
    "calendar",
    "drive",
    "drive",
  ]);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

test("a bookmark's cross in New tab, or Shift+Delete or Shift+Backspace on the highlighted one, removes it, the launcher staying open with its text, focus and a highlight on the next row; plain Delete and Backspace only edit the text", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedLauncher(userDataDir, standIn, {
    bookmarks: [
      { id: "b1", url: standIn.calendarUrl, title: "Week", app: "calendar" },
      { id: "b2", url: standIn.driveUrl, title: "Files", app: "drive" },
      { id: "b3", url: `${standIn.driveUrl}#x`, title: "Shared", app: "drive" },
      { id: "b4", url: `${standIn.driveUrl}#y`, title: "Recent", app: "drive" },
    ],
  });

  const app = await launchApp();
  const overlay = await findOverlayDocument(app);
  const { card, field, options, selected } = launcher(overlay);

  await findPage(app, standIn.url);
  await clickMenuItem(app, "app.open");
  await field.fill("drive");
  await expect(options).toHaveText([
    "Drive",
    /^Files/u,
    /^Shared/u,
    /^Recent/u,
  ]);
  await expect(card.getByRole("listbox")).toHaveAccessibleDescription(
    "Shift+Delete removes the highlighted bookmark"
  );

  // The cross is the pointer's alone: no row has a button to reach.
  await expect(options.getByRole("button")).toHaveCount(0);

  // The keyboard puts the highlight on Files, which the pointer, coming to
  // its cross, keeps there.
  await field.press("Home");
  await field.press("ArrowDown");
  await expect(selected).toHaveText(/^Files/u);

  const files = options.filter({ hasText: "Files" });

  await files.getByTitle("Remove bookmark").click();
  await expect(options).toHaveText(["Drive", /^Shared/u, /^Recent/u]);
  await expect(card).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("drive");
  await expect(selected).toHaveText(/^Shared/u);
  await expect
    .poll(() => readBookmarks(userDataDir))
    .toStrictEqual(["calendar Week", "drive Shared", "drive Recent"]);

  await field.press("Shift+Delete");
  await expect(options).toHaveText(["Drive", /^Recent/u]);
  await expect(field).toHaveValue("drive");
  await expect(selected).toHaveText(/^Recent/u);

  await field.press("Shift+Backspace");
  await expect(options).toHaveText(["Drive"]);
  await expect(field).toHaveValue("drive");
  await expect(selected).toHaveText("Drive");
  await expect
    .poll(() => readBookmarks(userDataDir))
    .toStrictEqual(["calendar Week"]);

  await field.press("Backspace");
  await field.press("Delete");
  await expect(field).toHaveValue("driv");
  await expect(options).toHaveText(["Drive"]);
  expect(await readBookmarks(userDataDir)).toStrictEqual(["calendar Week"]);
});

test("New tab with no bookmarks says so in its Bookmarks group, a line that is no row to choose and no result, gone once something is typed", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const overlay = await findOverlayDocument(app);
  const { field, apps, bookmarks, card, options, selected } = launcher(overlay);
  const none = bookmarks.getByText("No bookmarks yet", { exact: true });

  await findPage(app, standIn.calendarUrl);
  await clickMenuItem(app, "app.open");
  await expect(field).toBeFocused();
  await expect(card.getByText("Apps", { exact: true })).toBeVisible();
  await expect(card.getByText("Bookmarks", { exact: true })).toBeVisible();
  await expect(none).toBeVisible();
  await expect(bookmarks.getByText(/^Bookmark a page/u)).toHaveCount(0);
  await expect(bookmarks.getByRole("option")).toHaveCount(0);
  await expect(options).toHaveCount(APP_NAMES.length);

  // The last stop down the list is the last app.
  await field.press("End");
  await expect(selected).toHaveText("Meet");

  await field.fill("cal");
  await expect(bookmarks).toHaveCount(0);
  await expect(apps.getByRole("option")).toHaveText(["Calendar"]);

  await field.fill("zz");
  await expect(card.getByText("No results.", { exact: true })).toBeVisible();
  await expect(none).toHaveCount(0);
});

test("Open in split lists the bookmarks too, and one chosen opens as a new tab in the new pane though a tab is at its page, moving nothing", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn, {
    bookmarks: [
      { id: "b2", url: standIn.driveUrl, title: "Files", app: "drive" },
    ],
  });

  const app = await launchApp();
  const overlay = await findOverlayDocument(app);
  const { card, bookmarks } = launcher(overlay, "Open in split");

  await findPage(app, standIn.calendarUrl);
  await clickMenuItem(app, "tab.splitRight");
  await expect(card).toBeVisible();
  await bookmarks.getByRole("option", { name: /^Files/u }).click();
  await expect(card).toHaveCount(0);
  await expect
    .poll(async () => {
      const profile = await readProfile(userDataDir);

      return {
        tabs: profile?.tabs.map(({ app: tabApp, url }) => [tabApp, url]),
        splits: profile?.splits?.length ?? 0,
      };
    })
    .toStrictEqual({
      tabs: [
        ["gmail", standIn.url],
        ["calendar", expect.any(String)],
        ["drive", standIn.driveUrl],
        ["drive", standIn.driveUrl],
      ],
      splits: 1,
    });
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
  await clickMenuItem(second, "app.open");
  await expect(launcher(overlay).bookmarks.getByRole("option")).toHaveText([
    new RegExp(`^${CALENDAR_TITLE}\\s*Calendar`, "u"),
  ]);
});
