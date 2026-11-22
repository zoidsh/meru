import type { ElectronApplication, Page } from "@playwright/test";
import { isEqual } from "es-toolkit";

import { contentViewBounds } from "#core/layout.ts";
import type { Platform } from "#core/platform.ts";
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";

import {
  expect,
  findPage,
  readState as readSavedState,
  readViews,
  test,
  writeState,
} from "./lib/app.ts";
import {
  addProfileInSettings,
  askedRemovals,
  confirmRemovals,
  profileRow as settingsProfileRow,
  removeProfileInSettings,
} from "./lib/settings.ts";
import { STAND_IN_COOKIE, STAND_IN_TITLE } from "./lib/stand-in.ts";

interface SavedState {
  profiles: { id: string; name: string; tabs?: { title: string }[] }[];
  selectedProfileId: string;
}

const readState = (userDataDir: string) =>
  readSavedState<SavedState>(userDataDir);

/** Each content view: whose session it is in, where it sits, and whether it shows. */
const readProfileViews = async (app: ElectronApplication) => {
  const { area, views } = await readViews(app);

  return {
    content: area,
    views: views.map(({ partition, bounds, visible }) => ({
      profileId: partition.replace(/^persist:/u, ""),
      bounds,
      visible,
    })),
  };
};

const readCookies = (
  app: ElectronApplication,
  profileId: string,
  url: string
) =>
  app.evaluate(
    async ({ session }, { partition, url: cookieUrl }) => {
      const cookies = await session
        .fromPartition(partition)
        .cookies.get({ url: cookieUrl });

      return cookies.map((cookie) => `${cookie.name}=${cookie.value}`);
    },
    { partition: `persist:${profileId}`, url }
  );

const profileRow = (shell: Page) =>
  shell.getByRole("group", { name: "Profiles" });

const profileTabs = (shell: Page) => profileRow(shell).getByRole("button");

/** By the name it starts with: a profile not signed in also says so. */
const profileButton = (shell: Page, name: string) =>
  profileRow(shell).getByRole("button", {
    name: new RegExp(`^${name}(,|$)`, "u"),
  });

/** Adds a profile in Settings, the titlebar having no button for it. */
const addProfile = async (app: ElectronApplication, shell: Page) => {
  const settings = await addProfileInSettings(app);

  await expect(profileTabs(shell)).toHaveCount(2);

  return settings;
};

test("adding a profile draws the profile row, the new one selected, and a view in a session of its own", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  await findPage(app, standIn.url);
  // One profile draws no row.
  await expect(profileRow(shell)).toHaveCount(0);

  await addProfile(app, shell);

  await expect(profileTabs(shell)).toHaveText(["Default", "Profile 2"]);
  await expect(profileButton(shell, "Profile 2")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  const { profiles, selectedProfileId } = await readState(userDataDir);
  const [first, second] = profiles.map((profile) => profile.id) as [
    string,
    string,
  ];

  expect(profiles.map((profile) => profile.name)).toStrictEqual([
    "Default",
    "Profile 2",
  ]);
  expect(selectedProfileId).toBe(second);

  // The second view's first request carried none of the first one's cookie.
  await expect.poll(() => standIn.cookieHeaders).toStrictEqual(["", ""]);

  const { content, views } = await readProfileViews(app);

  expect(views).toStrictEqual([
    {
      profileId: first,
      bounds: contentViewBounds(
        content,
        "hidden",
        process.platform as Platform
      ),
      visible: false,
    },
    {
      profileId: second,
      bounds: contentViewBounds(
        content,
        "hidden",
        process.platform as Platform
      ),
      visible: true,
    },
  ]);
});

test("switching back shows the first view in the content rectangle and hides the other", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  await findPage(app, standIn.url);
  await addProfile(app, shell);
  await expect.poll(() => standIn.cookieHeaders.length).toBe(2);

  await profileButton(shell, "Default").click();

  await expect(profileButton(shell, "Default")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  const { profiles, selectedProfileId } = await readState(userDataDir);
  const ids = profiles.map((profile) => profile.id);

  expect(selectedProfileId).toBe(ids[0]);
  await expect
    .poll(async () => {
      const { content, views } = await readProfileViews(app);

      return views.map((view) => ({
        ...view,
        inContent: isEqual(
          view.bounds,
          contentViewBounds(content, "hidden", process.platform as Platform)
        ),
      }));
    })
    .toMatchObject([
      { profileId: ids[0], visible: true, inContent: true },
      { profileId: ids[1], visible: false, inContent: true },
    ]);
  // Neither view loaded again.
  expect(standIn.cookieHeaders).toHaveLength(2);
});

test("a relaunch restores both profiles and the selection, showing the selected profile's view and loading the other's behind it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const first = await launchApp();
  const firstShell = await findPage(first, "meru-app:");

  await addProfile(first, firstShell);
  await expect.poll(() => standIn.cookieHeaders.length).toBe(2);
  // Where each Gmail tab's page is, written within a second of its load.
  await expect
    .poll(async () => {
      const { profiles } = await readState(userDataDir);

      return profiles.map((profile) => profile.tabs?.[0]?.title);
    })
    .toStrictEqual([STAND_IN_TITLE, STAND_IN_TITLE]);

  const saved = await readState(userDataDir);

  await first.close();

  const second = await launchApp();
  const shell = await findPage(second, "meru-app:");

  await expect(profileTabs(shell)).toHaveText(["Default", "Profile 2"]);
  await expect(profileButton(shell, "Profile 2")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect.poll(() => standIn.cookieHeaders.length).toBe(4);

  const { views } = await readProfileViews(second);
  const other = saved.profiles.find(
    ({ id }) => id !== saved.selectedProfileId
  )?.id;

  expect(
    views.map(({ profileId, visible }) => ({ profileId, visible }))
  ).toStrictEqual([
    { profileId: saved.selectedProfileId, visible: true },
    { profileId: other, visible: false },
  ]);
  expect(await readState(userDataDir)).toStrictEqual(saved);
});

const readProfileIds = async (userDataDir: string) => {
  const { profiles } = await readState(userDataDir);

  return profiles.map((profile) => profile.id);
};

const readViewList = async (app: ElectronApplication) => {
  const { views } = await readProfileViews(app);

  return views;
};

test("removing the selected profile in Settings, once confirmed, removes its button, its view and its session's cookie", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  await findPage(app, standIn.url);

  const settings = await addProfile(app, shell);

  await expect.poll(() => standIn.cookieHeaders.length).toBe(2);

  const ids = (await readProfileIds(userDataDir)) as [string, string];

  await expect
    .poll(() => readCookies(app, ids[1], standIn.url))
    .toStrictEqual([STAND_IN_COOKIE]);

  await confirmRemovals(app);
  await removeProfileInSettings(settings, "Profile 2");

  // One profile left draws no row.
  await expect(profileRow(shell)).toHaveCount(0);
  expect(await askedRemovals(app)).toStrictEqual([
    expect.objectContaining({
      message: "Remove Profile 2?",
      buttons: ["Remove Profile", "Cancel"],
      defaultId: 1,
      cancelId: 1,
    }),
  ]);

  const { profiles, selectedProfileId } = await readState(userDataDir);

  expect(profiles.map((profile) => profile.id)).toStrictEqual([ids[0]]);
  expect(selectedProfileId).toBe(ids[0]);
  await expect
    .poll(() => readViewList(app))
    .toMatchObject([{ profileId: ids[0], visible: true }]);
  await expect
    .poll(() => readCookies(app, ids[1], standIn.url))
    .toStrictEqual([]);
  expect(await readCookies(app, ids[0], standIn.url)).toStrictEqual([
    STAND_IN_COOKIE,
  ]);

  // The last profile cannot be removed.
  await settingsProfileRow(settings, "Default").click();
  await expect(
    settings.getByRole("button", { name: "Remove profile…" })
  ).toBeDisabled();
});

test("cancelling the confirmation keeps the profile", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  await findPage(app, standIn.url);

  const settings = await addProfile(app, shell);

  await confirmRemovals(app, false);
  await removeProfileInSettings(settings, "Profile 2");

  await expect
    .poll(() => askedRemovals(app))
    .toStrictEqual([expect.objectContaining({ message: "Remove Profile 2?" })]);

  // Main applies changes in order, so once this selection shows, a removal
  // the confirmation started would have shown first.
  await profileButton(shell, "Default").click();
  await expect(profileButton(shell, "Default")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await expect(profileTabs(shell)).toHaveText(["Default", "Profile 2"]);
  expect(await readProfileIds(userDataDir)).toHaveLength(2);
});

/** Presses Cmd, or Ctrl or Alt, and `key` in the page at `url`, as the system hands keys to it. */
const pressShortcutInPage = (
  app: ElectronApplication,
  url: string,
  key: string
) =>
  app.evaluate(
    ({ webContents }, { pageUrl, keyCode, platform }) => {
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(pageUrl));
      // As the registry's profile shortcuts are on each platform.
      const modifiers: Record<string, "meta" | "alt"> = {
        darwin: "meta",
        linux: "alt",
      };
      const modifier = modifiers[platform] ?? "control";

      for (const type of ["keyDown", "keyUp"] as const) {
        page?.sendInputEvent({
          type,
          keyCode,
          modifiers: [modifier],
        });
      }
    },
    { pageUrl: url, keyCode: key, platform: process.platform }
  );

test("at a narrow width with many profiles, the row scrolls with an arrow over each clipped end, a profile chosen by its shortcut scrolls into view clear of the fades, a name of the longest length is cut short, and the title bar keeps room to drag", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const longest = "W".repeat(PROFILE_NAME_MAX_LENGTH);
  const names = [
    "Default",
    ...Array.from({ length: 8 }, (_, index) => `Profile ${index + 2}`),
    longest,
  ];

  await writeState(userDataDir, {
    profiles: names.map((name, index) => ({ id: `p${index}`, name })),
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.url);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(720, 480);
  });
  await expect(profileTabs(shell)).toHaveCount(10);

  const ninth = profileButton(shell, "Profile 9");
  const scrollLeft = shell.getByRole("button", {
    name: "Scroll profiles left",
  });
  const scrollRight = shell.getByRole("button", {
    name: "Scroll profiles right",
  });

  await expect(profileButton(shell, "Default")).toBeInViewport();
  await expect(ninth).not.toBeInViewport();
  await expect(scrollRight).toBeVisible();
  await expect(scrollLeft).toHaveCount(0);

  await pressShortcutInPage(app, standIn.url, "9");

  await expect(ninth).toHaveAttribute("aria-pressed", "true");
  await expect(scrollLeft).toBeVisible();
  // The longest name still follows it.
  await expect(scrollRight).toBeVisible();

  // Clear of the 40px fade over each clipped end, not only in view.
  const clearOfFades = () =>
    ninth.evaluate((button) => {
      const row = button.closest("fieldset")?.getBoundingClientRect();
      const box = button.getBoundingClientRect();

      return (
        row !== undefined &&
        box.left >= row.left + 40 - 0.5 &&
        box.right <= row.right - 40 + 0.5
      );
    });

  await expect.poll(clearOfFades).toBe(true);

  // A profile before it growing, as one does when the mark of its signed-out
  // account appears after the selection, pushes it along; it stays clear.
  await profileButton(shell, "Profile 8").evaluate((button) => {
    button.append("WWWWWW");
  });
  await expect.poll(clearOfFades).toBe(true);

  // A button added before it after the selection, as a profile added later
  // is, pushes it along too; it stays clear.
  await profileButton(shell, "Profile 8").evaluate((button) => {
    const added = button.cloneNode(true);

    added.textContent = "WWWWWWWWWWWW";
    button.before(added);
  });
  await expect.poll(clearOfFades).toBe(true);

  // The arrow scrolls by most of the row.
  const scrolled = () =>
    profileRow(shell).evaluate((row) => Math.round(row.scrollLeft));
  const before = await scrolled();

  await scrollLeft.click();
  await expect.poll(scrolled).toBeLessThan(before);

  const [row, inbox] = await Promise.all([
    profileRow(shell).boundingBox(),
    shell.getByRole("button", { name: "Unified inbox" }).boundingBox(),
  ]);

  expect(
    (inbox?.x ?? 0) - ((row?.x ?? 0) + (row?.width ?? 0))
  ).toBeGreaterThanOrEqual(64);

  const long = profileButton(shell, longest);

  await long.click();
  await expect(long).toHaveAttribute("aria-pressed", "true");
  await expect(long).toBeInViewport();
  const longBox = await long.boundingBox();

  expect(longBox?.width).toBeLessThanOrEqual(160);
});
