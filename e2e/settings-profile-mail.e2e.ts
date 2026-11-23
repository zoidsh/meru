import { expect, findOverlayDocument, test } from "./lib/app.ts";
import {
  launchWithMail,
  notified,
  openProfiles,
  openSettings,
  pageLine,
  pollAll,
  profileRow,
  profileTab,
  switchNamed,
} from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
import { listing } from "./lib/stand-in/feed.ts";

test("Check mail off clears the titlebar's count and the profile's inbox rows and stops its notifications; on brings them back", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launchWithMail(launchApp, userDataDir, standIn, [
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
  await inboxButton.click();
  await expect(rows.filter({ hasText: "Subject b2" })).toHaveCount(1);
  await inboxButton.click();
  await expect(rows).toHaveCount(0);

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
  const { app, shell } = await launchWithMail(launchApp, userDataDir, standIn, [
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
  const { app } = await launchWithMail(launchApp, userDataDir, standIn, [
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
    const { app } = await launchWithMail(launchApp, userDataDir, standIn, [
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
