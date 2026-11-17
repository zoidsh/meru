import type { ElectronApplication, Page } from "@playwright/test";

import {
  expect,
  findPage,
  readState,
  readViews,
  test,
  writeState,
} from "./lib/app.ts";
import {
  CALENDAR_TITLE,
  DRIVE_TITLE,
  GMAIL_LINK_HASH,
  NEXT_WEEK_PATH,
  STAND_IN_TITLE,
} from "./lib/stand-in.ts";

interface SavedState {
  profiles: {
    id: string;
    tabs: { id: string; app: string; url: string }[];
    selectedTabId: string;
  }[];
}

/** The first profile, as state.json holds it. */
const readProfile = async (userDataDir: string) => {
  const {
    profiles: [profile],
  } = await readState<SavedState>(userDataDir);

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
    exact: true,
  });

/** Each content view's page, its session's partition and whether it shows. */
const readTabViews = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views.map(({ url, partition, visible }) => ({
    url,
    partition,
    visible,
  }));
};

const openFrom = async (page: Page, link: string) => {
  await page.getByRole("link", { name: link }).click();
};

test("a link opens a tab of its app in the same session, selected; a link to Gmail selects Gmail's; tabs select, and close but not Gmail's", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  const gmail = await findPage(app, standIn.url);

  await openFrom(gmail, "Open Calendar");

  await expect(tabs(shell)).toHaveText([STAND_IN_TITLE, CALENDAR_TITLE]);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );

  const profile = await readProfile(userDataDir);
  const partition = `persist:${profile.id}`;

  await expect
    .poll(() => readTabViews(app))
    .toStrictEqual([
      { url: standIn.url, partition, visible: false },
      { url: standIn.calendarUrl, partition, visible: true },
    ]);

  await openFrom(await findPage(app, standIn.calendarUrl), "Open Gmail");

  await expect(tabs(shell)).toHaveCount(2);
  await expect(tab(shell, STAND_IN_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect
    .poll(() => readTabViews(app))
    .toStrictEqual([
      {
        url: `${standIn.url}${GMAIL_LINK_HASH}`,
        partition,
        visible: true,
      },
      { url: standIn.calendarUrl, partition, visible: false },
    ]);

  // The close buttons are for the pointer, outside the list; keys close too.
  await expect(tabs(shell).getByRole("button")).toHaveCount(0);
  await expect(
    shell.getByRole("button", { name: `Close ${STAND_IN_TITLE}` })
  ).toHaveCount(0);
  await expect(
    shell.getByRole("button", { name: `Close ${CALENDAR_TITLE}` })
  ).toHaveCount(1);
  await tab(shell, STAND_IN_TITLE).press("Delete");
  await expect(tabs(shell)).toHaveCount(2);

  await tab(shell, CALENDAR_TITLE).press("Delete");

  // One tab left hides the sidebar, and its list with it.
  await expect(tabs(shell)).toHaveCount(0);
  await expect.poll(() => readTabViews(app)).toHaveLength(1);
  const { tabs: left } = await readProfile(userDataDir);

  expect(left).toHaveLength(1);
});

test("a relaunch restores the tabs, each where it was, and the selection, and loads only the selected tab", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const first = await launchApp();
  const gmail = await findPage(first, standIn.url);
  const firstShell = await findPage(first, "meru-app:");
  const nextWeek = new URL(NEXT_WEEK_PATH, standIn.calendarUrl).href;

  await openFrom(gmail, "Open Calendar");
  await openFrom(await findPage(first, standIn.calendarUrl), "Next week");
  await findPage(first, nextWeek);
  await tab(firstShell, STAND_IN_TITLE).click();
  await openFrom(gmail, "Open Drive");
  await expect(tabs(firstShell)).toHaveText([
    STAND_IN_TITLE,
    CALENDAR_TITLE,
    DRIVE_TITLE,
  ]);
  await tab(firstShell, CALENDAR_TITLE).click();
  // Where each tab's page is, written within a second of its load, and the
  // selection, which the click writes after it reaches main.
  await expect
    .poll(() =>
      readProfile(userDataDir).then((saved) => [
        saved.tabs.map((each) => each.url),
        saved.tabs.find((each) => each.id === saved.selectedTabId)?.url,
      ])
    )
    .toStrictEqual([[standIn.url, nextWeek, standIn.driveUrl], nextWeek]);
  await first.close();

  const before = standIn.requests();
  const second = await launchApp();
  const shell = await findPage(second, "meru-app:");

  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    CALENDAR_TITLE,
    DRIVE_TITLE,
  ]);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect
    .poll(() => standIn.requests())
    .toStrictEqual({ ...before, calendar: before.calendar + 1 });

  const profile = await readProfile(userDataDir);

  expect(await readTabViews(second)).toStrictEqual([
    { url: nextWeek, partition: `persist:${profile.id}`, visible: true },
  ]);
});

test("the strip scrolls to keep the selected tab in view, and its arrow keys go up and down", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const titles = Array.from({ length: 30 }, (_, index) => `Week ${index + 1}`);

  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          ...titles.map((title, index) => ({
            id: `c${index}`,
            app: "calendar",
            url: standIn.calendarUrl,
            title,
          })),
        ],
        selectedTabId: "c29",
      },
    ],
    selectedProfileId: "p",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const last = tab(shell, "Week 30");

  await expect(last).toHaveAttribute("aria-selected", "true");
  await expect(last).toBeInViewport();
  await expect(tab(shell, "Week 1")).not.toBeInViewport();
  await expect(shell.getByRole("tablist", { name: "Tabs" })).toHaveAttribute(
    "aria-orientation",
    "vertical"
  );

  await last.focus();
  await last.press("ArrowUp");
  await expect(tab(shell, "Week 29")).toBeFocused();
  await tab(shell, "Week 29").press("Home");
  // Never loaded, so named for its app.
  const gmail = tab(shell, "Gmail");

  await expect(gmail).toBeFocused();
  await gmail.press("Enter");

  await expect(gmail).toHaveAttribute("aria-selected", "true");
  await expect(gmail).toBeInViewport();
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
});

test("a tab whose renderer is killed says it stopped working, and reloads on the control", async ({
  app,
  shell,
  standIn,
}) => {
  await findPage(app, standIn.url);

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
