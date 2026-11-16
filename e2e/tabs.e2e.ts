import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { expect, findPage, test } from "./lib/app.ts";
import { CALENDAR_TITLE, DRIVE_TITLE, STAND_IN_TITLE } from "./lib/stand-in.ts";

interface SavedState {
  profiles: {
    id: string;
    tabs: { id: string; app: string; url: string }[];
    selectedTabId: string;
  }[];
}

const readState = async (userDataDir: string) =>
  JSON.parse(
    await readFile(path.join(userDataDir, "state.json"), "utf-8")
  ) as SavedState;

/** The first profile, as state.json holds it. */
const readProfile = async (userDataDir: string) => {
  const {
    profiles: [profile],
  } = await readState(userDataDir);

  if (!profile) {
    throw new Error("state.json holds no profile");
  }

  return profile;
};

const tabs = (shell: Page) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab");

const tab = (shell: Page, title: string) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab", {
    name: title,
  });

/** Each content view: its page's URL, its session's partition, whether it shows. */
const readViews = (app: ElectronApplication, partition: string) =>
  app.evaluate(({ BrowserWindow, session }, expected) => {
    const window = BrowserWindow.getAllWindows().find(
      (candidate) => !candidate.getParentWindow()
    );

    return (window?.contentView.children ?? []).map((view) => {
      const { webContents } = view as Electron.WebContentsView;

      return {
        url: webContents.getURL(),
        inSession: webContents.session === session.fromPartition(expected),
        visible: view.getVisible(),
      };
    });
  }, partition);

const openFromGmail = async (gmail: Page, link: string) => {
  await gmail.getByRole("link", { name: link }).click();
};

test("a link opens a tab of its app in the same session, selected, and tabs select and close, but not Gmail's", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  const gmail = await findPage(app, standIn.url);

  await openFromGmail(gmail, "Open Calendar");

  await expect(tabs(shell)).toHaveText([STAND_IN_TITLE, CALENDAR_TITLE]);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );

  const profile = await readProfile(userDataDir);
  const partition = `persist:${profile.id}`;

  await expect
    .poll(() => readViews(app, partition))
    .toStrictEqual([
      { url: standIn.url, inSession: true, visible: false },
      { url: standIn.calendarUrl, inSession: true, visible: true },
    ]);
  await expect(
    shell.getByRole("button", { name: `Close ${STAND_IN_TITLE}` })
  ).toHaveCount(0);

  await tab(shell, STAND_IN_TITLE).click();
  await expect
    .poll(() =>
      readViews(app, partition).then((views) =>
        views.map((view) => view.visible)
      )
    )
    .toStrictEqual([true, false]);

  await shell.getByRole("button", { name: `Close ${CALENDAR_TITLE}` }).click();

  await expect(tabs(shell)).toHaveText([STAND_IN_TITLE]);
  await expect.poll(() => readViews(app, partition)).toHaveLength(1);
  const { tabs: left } = await readProfile(userDataDir);

  expect(left).toHaveLength(1);
});

test("a relaunch restores the tabs and the selection, and loads only the selected tab", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const first = await launchApp();
  const gmail = await findPage(first, standIn.url);
  const firstShell = await findPage(first, "meru-app:");

  await openFromGmail(gmail, "Open Calendar");
  await expect(tabs(firstShell)).toHaveCount(2);
  await tab(firstShell, STAND_IN_TITLE).click();
  await openFromGmail(gmail, "Open Drive");
  await expect(tabs(firstShell)).toHaveText([
    STAND_IN_TITLE,
    CALENDAR_TITLE,
    DRIVE_TITLE,
  ]);
  // Where each tab's page is, written within a second of its load.
  await expect
    .poll(() =>
      readProfile(userDataDir).then((saved) =>
        saved.tabs.map((each) => each.url)
      )
    )
    .toStrictEqual([standIn.url, standIn.calendarUrl, standIn.driveUrl]);
  await first.close();

  const before = standIn.requests();
  const second = await launchApp();
  const shell = await findPage(second, "meru-app:");

  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    CALENDAR_TITLE,
    DRIVE_TITLE,
  ]);
  await expect(tab(shell, DRIVE_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect
    .poll(() => standIn.requests())
    .toStrictEqual({ ...before, drive: before.drive + 1 });

  const profile = await readProfile(userDataDir);

  expect(await readViews(second, `persist:${profile.id}`)).toStrictEqual([
    { url: standIn.driveUrl, inSession: true, visible: true },
  ]);
});

test("a tab that cannot load at launch says so in the shell, and loads by itself once its server answers", async ({
  launchApp,
  standIn,
}) => {
  await standIn.refuse();

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const problem = shell.getByRole("heading", { name: "Gmail couldn’t load" });

  await expect(problem).toBeVisible();
  await expect(shell.getByText("ERR_CONNECTION_REFUSED")).toBeVisible();

  await standIn.answer();

  await expect(problem).toBeHidden({ timeout: 15_000 });
  await findPage(app, standIn.url);
  await expect(tabs(shell)).toHaveText([STAND_IN_TITLE]);
});

test("a tab whose renderer is killed says it stopped working, and reloads on the control", async ({
  app,
  shell,
  standIn,
}) => {
  await findPage(app, standIn.url);
  await expect(tabs(shell)).toHaveText([STAND_IN_TITLE]);

  await app.evaluate(({ webContents }, url) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL() === url)
      ?.forcefullyCrashRenderer();
  }, standIn.url);

  await expect(
    shell.getByRole("heading", { name: "Gmail stopped working" })
  ).toBeVisible();
  expect(standIn.requests().gmail).toBe(1);

  await shell.getByRole("button", { name: "Reload" }).click();

  await expect(
    shell.getByRole("heading", { name: "Gmail stopped working" })
  ).toBeHidden();
  await expect.poll(() => standIn.requests().gmail).toBe(2);
});
