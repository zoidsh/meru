import type { ElectronApplication, Page } from "@playwright/test";

import {
  SHELL_URL,
  expect,
  findOverlayDocument,
  findPage,
  test,
  writeState,
} from "./lib/app.ts";
import { openProfiles, openSettings, profileRow } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { signIn } from "./lib/stand-in.ts";
import { listing } from "./lib/stand-in/feed.ts";
import type { FeedAnswer } from "./lib/stand-in/feed.ts";

interface Seeded {
  id: string;
  name: string;
  /** What the profile's own session's feed answers; signed out when not given. */
  feed?: FeedAnswer;
  asleep?: boolean;
  checkMail?: boolean;
}

/**
 * Launches Meru on these profiles, the first selected, each with a feed
 * signed in to the stand-in's as its own account, and waits until every
 * profile signed in has been counted.
 */
const launchWith = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn,
  profiles: readonly Seeded[]
) => {
  await writeState(userDataDir, {
    profiles: profiles.map(({ id, name, asleep, checkMail }) => ({
      id,
      name,
      ...(asleep === undefined ? {} : { asleep }),
      ...(checkMail === undefined ? {} : { checkMail }),
    })),
    selectedProfileId: profiles[0]?.id,
  });

  for (const { id, feed } of profiles) {
    if (feed) {
      standIn.setFeed(`persist:${id}`, feed);
    }
  }

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);

  for (const { id, feed } of profiles) {
    if (feed) {
      // oxlint-disable-next-line no-await-in-loop -- one session after another
      await signIn(app, standIn, id);
    }
  }

  await pollAll(app);

  return { app, shell };
};

/** Waking polls every profile at once. */
const pollAll = (app: ElectronApplication) =>
  app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });

const profileTab = (shell: Page, name: string) =>
  shell
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: new RegExp(`^${name}`, "u") });

/** The titles of the notifications the suite's build captured, in order. */
const notified = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestNotifications") as { title: string }[]
    ).map(({ title }) => title)
  );

const switchNamed = (page: Page, name: string) =>
  page.getByRole("switch", { name, exact: true });

const pageLine = (page: Page, text: string | RegExp) =>
  page.getByRole("main").getByText(text);

test("Check mail off clears the titlebar's count and the profile's inbox rows and stops its notifications; on brings them back", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launchWith(launchApp, userDataDir, standIn, [
    { id: "home", name: "Home", feed: listing("a1") },
    { id: "work", name: "Work", feed: listing("b1") },
  ]);

  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 1 unread message"
  );

  const overlay = await findOverlayDocument(app);
  const page = await openSettings(app);
  const checkMail = switchNamed(page, "Check mail");

  await openProfiles(page);
  await profileRow(page, "Work").click();
  await expect(checkMail).toBeChecked();
  await checkMail.click();

  await expect(checkMail).not.toBeChecked();
  await expect(profileTab(shell, "Work")).toHaveAccessibleName("Work");

  const inboxButton = shell.getByRole("button", {
    name: "Unified inbox",
    exact: true,
  });
  const rows = overlay
    .getByRole("dialog", { name: "Unified inbox" })
    .getByRole("grid", { name: "Unread messages" })
    .getByRole("row");

  await inboxButton.click();
  await expect(rows.filter({ hasText: "Subject a1" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Subject b1" })).toHaveCount(0);
  await inboxButton.click();
  await expect(rows).toHaveCount(0);

  standIn.setFeed("persist:home", listing("a2", "a1"));
  standIn.setFeed("persist:work", listing("b2", "b1"));
  await pollAll(app);

  await expect.poll(() => notified(app)).toStrictEqual(["Sender a2"]);
  await expect(profileTab(shell, "Work")).toHaveAccessibleName("Work");

  await checkMail.click();

  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 2 unread messages"
  );
  // Mail that came while it was off is not told; what comes after is.
  standIn.setFeed("persist:work", listing("b3", "b2", "b1"));
  await pollAll(app);

  await expect
    .poll(() => notified(app))
    .toStrictEqual(["Sender a2", "Sender b3"]);
});

test("Sleep from Settings puts the titlebar's profile to sleep, is disabled for the last awake one, and waking selects it", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launchWith(launchApp, userDataDir, standIn, [
    { id: "home", name: "Home", feed: listing() },
    { id: "work", name: "Work", feed: listing() },
  ]);
  const page = await openSettings(app);
  const sleep = switchNamed(page, "Sleep");

  await openProfiles(page);
  await profileRow(page, "Work").click();
  await sleep.click();

  await expect(sleep).toBeChecked();
  await expect(profileTab(shell, "Work")).toHaveAccessibleName("Work, asleep");
  await expect(sleep).toHaveAccessibleDescription(
    "Its pages stay closed until it is selected again. Its mail is still checked."
  );

  await page.getByRole("button", { name: "Back" }).click();
  await expect(profileRow(page, "Work")).toHaveAccessibleDescription(
    "stand-in@example.com Asleep"
  );
  await profileRow(page, "Home").click();

  await expect(sleep).toBeDisabled();
  await expect(sleep).toHaveAccessibleDescription(
    "The last awake profile can't sleep."
  );

  await page.getByRole("button", { name: "Back" }).click();
  await profileRow(page, "Work").click();
  await sleep.click();

  await expect(sleep).not.toBeChecked();
  await expect(profileTab(shell, "Work")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(profileTab(shell, "Work")).toHaveAccessibleName("Work");
});

test("the list and a profile's page show the signed-in address, Not signed in for a signed-out profile, and nothing while its mail is not checked", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app } = await launchWith(launchApp, userDataDir, standIn, [
    {
      id: "home",
      name: "Home",
      feed: { unreadCount: 0, address: "home@example.org" },
    },
    { id: "work", name: "Work" },
    {
      id: "club",
      name: "Club",
      feed: { unreadCount: 0, address: "club@example.org" },
      checkMail: false,
    },
  ]);
  const page = await openSettings(app);

  await openProfiles(page);

  await expect(profileRow(page, "Home")).toHaveAccessibleDescription(
    "home@example.org"
  );
  await expect(profileRow(page, "Work")).toHaveAccessibleDescription(
    "Not signed in"
  );
  await expect(profileRow(page, "Club")).toHaveAccessibleDescription("");

  await profileRow(page, "Home").click();
  await expect(
    pageLine(page, "Signed in to Google as home@example.org.")
  ).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await profileRow(page, "Work").click();
  await expect(
    pageLine(page, "Not signed in to Google, so its mail is not checked.")
  ).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await profileRow(page, "Club").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Club");
  await expect(pageLine(page, /signed in/iu)).toHaveCount(0);
  await expect(pageLine(page, /@/u)).toHaveCount(0);
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the list with an asleep and a signed-out profile, and a profile's page, light and dark", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    const { app } = await launchWith(launchApp, userDataDir, standIn, [
      {
        id: "home",
        name: "Home",
        feed: { unreadCount: 0, address: "home@example.org" },
      },
      {
        id: "work",
        name: "Work",
        feed: { unreadCount: 0, address: "work@example.com" },
        asleep: true,
      },
      { id: "side-project", name: "Side project" },
      {
        id: "travel",
        name: "Travel",
        feed: { unreadCount: 0, address: "travel@example.net" },
        checkMail: false,
      },
    ]);
    const page = await openSettings(app);

    await openProfiles(page);
    await expect(profileRow(page, "Side project")).toHaveAccessibleDescription(
      "Not signed in"
    );

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-profiles-mail", theme),
      });
    }

    await profileRow(page, "Work").click();
    await expect(switchNamed(page, "Sleep")).toBeChecked();

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-profile-page-mail", theme),
      });
    }
  });
});
