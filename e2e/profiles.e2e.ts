import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";
import { isEqual } from "es-toolkit";

import type { ShellBridge } from "#contract/shell.ts";
import { TAB_STRIP_WIDTH, contentViewBounds } from "#core/layout.ts";
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";

import { expect, findPage, readViews, test } from "./lib/app.ts";
import { STAND_IN_COOKIE, STAND_IN_TITLE } from "./lib/stand-in.ts";

interface SavedState {
  profiles: { id: string; name: string; tabs?: { title: string }[] }[];
  selectedProfileId: string;
}

const readState = async (userDataDir: string) =>
  JSON.parse(
    await readFile(path.join(userDataDir, "state.json"), "utf-8")
  ) as SavedState;

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

const profileTabs = (shell: Page) =>
  shell.getByRole("tablist", { name: "Profiles" }).getByRole("tab");

/** Starts the app on a state file holding these profiles, the last selected. */
const launchWithProfiles = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  names: string[]
) => {
  const profiles = names.map((name, index) => ({ id: `p${index}`, name }));

  await writeFile(
    path.join(userDataDir, "state.json"),
    JSON.stringify({
      version: 1,
      profiles,
      selectedProfileId: profiles.at(-1)?.id,
    })
  );

  const app = await launchApp();

  return { app, shell: await findPage(app, "meru-app:") };
};

const addProfile = async (shell: Page) => {
  await shell.getByRole("button", { name: "Add profile" }).click();
  await expect(profileTabs(shell)).toHaveCount(2);
};

test("adding a profile shows a second tab, selected, and a view in a session of its own", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  await findPage(app, standIn.url);
  await expect(profileTabs(shell)).toHaveText(["Default"]);
  await expect(shell.getByRole("tab", { name: "Default" })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await addProfile(shell);

  await expect(profileTabs(shell)).toHaveText(["Default", "Profile 2"]);
  await expect(shell.getByRole("tab", { name: "Profile 2" })).toHaveAttribute(
    "aria-selected",
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
      bounds: contentViewBounds(content, TAB_STRIP_WIDTH, "modern"),
      visible: false,
    },
    {
      profileId: second,
      bounds: contentViewBounds(content, TAB_STRIP_WIDTH, "modern"),
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
  await addProfile(shell);
  await expect.poll(() => standIn.cookieHeaders.length).toBe(2);

  await shell.getByRole("tab", { name: "Default" }).click();

  await expect(shell.getByRole("tab", { name: "Default" })).toHaveAttribute(
    "aria-selected",
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
          contentViewBounds(content, TAB_STRIP_WIDTH, "modern")
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

test("a relaunch restores both profiles and the selection, and creates only the selected profile's view", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const first = await launchApp();
  const firstShell = await findPage(first, "meru-app:");

  await addProfile(firstShell);
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
  await expect(shell.getByRole("tab", { name: "Profile 2" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect.poll(() => standIn.cookieHeaders.length).toBe(3);

  const { views } = await readProfileViews(second);

  expect(
    views.map(({ profileId, visible }) => ({ profileId, visible }))
  ).toStrictEqual([{ profileId: saved.selectedProfileId, visible: true }]);
  expect(await readState(userDataDir)).toStrictEqual(saved);
});

/**
 * Stands in for the native menu and confirmation, which would show on the
 * desktop: a popped-up menu is kept for the test to click an item of, and
 * the confirmation is recorded and answered with `response`.
 */
const stubNativeMenuAndDialog = (app: ElectronApplication, response: number) =>
  app.evaluate(({ dialog, Menu }, answer) => {
    const confirmations: unknown[] = [];
    const menus: Electron.Menu[] = [];

    Reflect.set(globalThis, "confirmations", confirmations);
    Reflect.set(globalThis, "poppedUpMenus", menus);
    Menu.prototype.popup = function popup(this: Electron.Menu) {
      menus.push(this);
    };
    dialog.showMessageBox = ((...args: unknown[]) => {
      confirmations.push(args.at(-1));

      return Promise.resolve({ response: answer, checkboxChecked: false });
    }) as typeof dialog.showMessageBox;
  }, response);

/** The items of the menu popped up last. */
const readMenu = (app: ElectronApplication) =>
  app.evaluate(() => {
    const menus = Reflect.get(globalThis, "poppedUpMenus") as Electron.Menu[];

    return (
      menus.at(-1)?.items.map(({ label, enabled }) => ({ label, enabled })) ??
      []
    );
  });

const clickMenuItem = (app: ElectronApplication, index: number) =>
  app.evaluate((_electron, itemIndex) => {
    const menus = Reflect.get(globalThis, "poppedUpMenus") as Electron.Menu[];

    menus.at(-1)?.items[itemIndex]?.click();
  }, index);

const readConfirmations = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "confirmations") as unknown[]);

const readProfileIds = async (userDataDir: string) => {
  const { profiles } = await readState(userDataDir);

  return profiles.map((profile) => profile.id);
};

const readViewList = async (app: ElectronApplication) => {
  const { views } = await readProfileViews(app);

  return views;
};

test("removing a profile from its tab's menu, once confirmed, removes its tab, its view and its session's cookie", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  await findPage(app, standIn.url);
  await addProfile(shell);
  await expect.poll(() => standIn.cookieHeaders.length).toBe(2);

  const ids = (await readProfileIds(userDataDir)) as [string, string];

  await expect
    .poll(() => readCookies(app, ids[1], standIn.url))
    .toStrictEqual([STAND_IN_COOKIE]);

  await stubNativeMenuAndDialog(app, 0);
  await shell
    .getByRole("tab", { name: "Profile 2" })
    .click({ button: "right" });

  await expect
    .poll(() => readMenu(app))
    .toStrictEqual([
      { label: "Rename…", enabled: true },
      { label: "Remove Profile 2…", enabled: true },
    ]);

  await clickMenuItem(app, 1);

  await expect(profileTabs(shell)).toHaveText(["Default"]);
  await expect(shell.getByRole("tab", { name: "Default" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  expect(await readConfirmations(app)).toStrictEqual([
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

  // The last profile's menu offers removal disabled.
  await shell.getByRole("tab", { name: "Default" }).click({ button: "right" });
  await expect
    .poll(() => readMenu(app))
    .toStrictEqual([
      { label: "Rename…", enabled: true },
      { label: "Remove Default…", enabled: false },
    ]);
});

test("cancelling the confirmation keeps the profile", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  await findPage(app, standIn.url);
  await addProfile(shell);
  await stubNativeMenuAndDialog(app, 1);
  await shell
    .getByRole("tab", { name: "Profile 2" })
    .click({ button: "right" });
  await expect
    .poll(() => readMenu(app))
    .toStrictEqual([
      { label: "Rename…", enabled: true },
      { label: "Remove Profile 2…", enabled: true },
    ]);
  await clickMenuItem(app, 1);

  await expect.poll(() => readConfirmations(app)).toHaveLength(1);

  // Main applies changes in order, so once this selection shows, a removal
  // the confirmation started would have shown first.
  await shell.getByRole("tab", { name: "Default" }).click();
  await expect(shell.getByRole("tab", { name: "Default" })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await expect(profileTabs(shell)).toHaveText(["Default", "Profile 2"]);
  expect(await readProfileIds(userDataDir)).toHaveLength(2);
});

test("at a narrow width with many profiles, the selected tab stays in view and the title bar keeps room to drag", async ({
  launchApp,
  userDataDir,
}) => {
  const { app, shell } = await launchWithProfiles(launchApp, userDataDir, [
    "Default",
    ...Array.from({ length: 9 }, (_, index) => `Profile ${index + 2}`),
  ]);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(900, 480);
  });
  await expect(profileTabs(shell)).toHaveCount(10);

  const add = shell.getByRole("button", { name: "Add profile" });
  const list = shell.getByRole("tablist", { name: "Profiles" });

  const selectedTabIsInList = async (name: string) => {
    const tab = shell.getByRole("tab", { name, exact: true });

    await expect(tab).toHaveAttribute("aria-selected", "true");

    const [tabBox, listBox] = await Promise.all([
      tab.boundingBox(),
      list.boundingBox(),
    ]);

    return (
      tabBox !== null &&
      listBox !== null &&
      tabBox.x >= listBox.x - 0.5 &&
      tabBox.x + tabBox.width <= listBox.x + listBox.width + 0.5
    );
  };

  expect(await selectedTabIsInList("Profile 10")).toBeTruthy();

  // Selected through the contract, since a Playwright click would scroll the
  // tab into view itself.
  const ids = await readProfileIds(userDataDir);
  const select = (profileId: string | undefined) =>
    shell.evaluate(
      (id) =>
        (window as unknown as { meru: ShellBridge }).meru.calls.selectProfile({
          profileId: id ?? "",
        }),
      profileId
    );

  await select(ids[0]);
  await expect.poll(() => selectedTabIsInList("Default")).toBeTruthy();

  // Narrower still, at the minimum width, and the selection must stay in view.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(720, 480);
  });
  await expect.poll(() => selectedTabIsInList("Default")).toBeTruthy();
  await select(ids[8]);
  await expect.poll(() => selectedTabIsInList("Profile 9")).toBeTruthy();

  const [banner, addBox] = await Promise.all([
    shell.getByRole("banner", { name: "Title bar" }).boundingBox(),
    add.boundingBox(),
  ]);

  expect(
    (banner?.width ?? 0) - ((addBox?.x ?? 0) + (addBox?.width ?? 0))
  ).toBeGreaterThanOrEqual(64);
});

test("a name of the longest length is cut short in its tab, whole in its tooltip, and leaves the other profiles in reach at the minimum width", async ({
  launchApp,
  userDataDir,
}) => {
  const longest = "W".repeat(PROFILE_NAME_MAX_LENGTH);
  const { app, shell } = await launchWithProfiles(launchApp, userDataDir, [
    "Default",
    "Profile 2",
    longest,
  ]);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(720, 480);
  });

  const add = shell.getByRole("button", { name: "Add profile" });
  const long = shell.getByRole("tab", { name: longest });

  await expect(long).toHaveAttribute("title", longest);

  const [list, banner, longBox, addBox, ...others] = await Promise.all([
    shell.getByRole("tablist", { name: "Profiles" }).boundingBox(),
    shell.getByRole("banner", { name: "Title bar" }).boundingBox(),
    long.boundingBox(),
    add.boundingBox(),
    shell.getByRole("tab", { name: "Default" }).boundingBox(),
    shell.getByRole("tab", { name: "Profile 2" }).boundingBox(),
  ]);

  expect(longBox?.width).toBeLessThanOrEqual(160);

  // Every other tab shows whole, with no scrolling, and so does Add.
  for (const box of others) {
    expect(box?.x).toBeGreaterThanOrEqual((list?.x ?? 0) - 0.5);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (list?.x ?? 0) + (list?.width ?? 0) + 0.5
    );
  }

  expect((addBox?.x ?? 0) + (addBox?.width ?? 0)).toBeLessThanOrEqual(
    banner?.width ?? 0
  );
});
