import { expect, findOverlayDocument, test } from "./lib/app.ts";
import {
  launchWithMail,
  notified,
  openProfiles,
  openSection,
  openSettings,
  pageLine,
  pollAll,
  profileRow,
  profileTab,
  scopeTab,
  switchNamed,
} from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
import { listing } from "./lib/stand-in/feed.ts";

test("Enabled off takes a profile out of the titlebar, the Unified inbox and notifications, keeps its Notifications tab, and on brings it back", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launchWithMail(launchApp, userDataDir, standIn, [
    { id: "home", name: "Home", feed: listing("a1") },
    { id: "work", name: "Work", feed: listing("b1") },
    { id: "club", name: "Club", feed: listing() },
  ]);
  const overlay = await findOverlayDocument(app);
  const page = await openSettings(app);
  const enabled = switchNamed(page, "Enabled");

  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 1 unread message"
  );

  await openProfiles(page);
  await profileRow(page, "Work").click();
  await expect(enabled).toBeChecked();
  await enabled.click();

  await expect(enabled).not.toBeChecked();
  await expect(enabled).toHaveAccessibleDescription(
    "Off: it stays signed in. Turn it on to put it back in the titlebar."
  );
  await expect(
    pageLine(
      page,
      "Disabled: not in the titlebar, the Unified inbox or the profile shortcuts, and its mail is not checked. It stays signed in."
    )
  ).toBeVisible();
  await expect(switchNamed(page, "Check mail")).toBeDisabled();
  await expect(switchNamed(page, "Check mail")).toHaveAccessibleDescription(
    "A disabled profile checks no mail; this applies once it is enabled."
  );
  await expect(switchNamed(page, "Sleep")).toBeDisabled();
  await expect(switchNamed(page, "Sleep")).toHaveAccessibleDescription(
    "A disabled profile has no pages."
  );
  await expect(profileTab(shell, "Work")).toHaveCount(0);

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

  await page.getByRole("button", { name: "Back" }).click();
  await expect(profileRow(page, "Work")).toHaveAccessibleDescription(
    "Disabled"
  );

  await openSection(page, "Notifications");
  await expect(scopeTab(page, "Work")).toBeVisible();

  await openProfiles(page);
  await profileRow(page, "Work").click();
  await enabled.click();

  await expect(enabled).toBeChecked();
  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 2 unread messages"
  );
  await expect(switchNamed(page, "Check mail")).toBeEnabled();
});

test("the last enabled profile's Enabled and Remove are disabled with their reasons, and one enabled again comes back asleep if it slept", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launchWithMail(launchApp, userDataDir, standIn, [
    { id: "home", name: "Home", feed: listing() },
    { id: "work", name: "Work", asleep: true, disabled: true },
  ]);
  const page = await openSettings(app);
  const enabled = switchNamed(page, "Enabled");
  const remove = page.getByRole("button", { name: "Remove profile…" });

  await expect(profileTab(shell, "Work")).toHaveCount(0);
  await expect(
    shell.getByRole("button", { name: "Unified inbox", exact: true })
  ).toHaveCount(0);

  await openProfiles(page);
  await profileRow(page, "Home").click();

  await expect(enabled).toBeDisabled();
  await expect(enabled).toHaveAccessibleDescription(
    "Meru needs at least one profile turned on."
  );
  await expect(remove).toBeDisabled();
  await expect(remove).toHaveAccessibleDescription(
    "Meru needs at least one profile turned on, so the last can't be removed."
  );

  await page.getByRole("button", { name: "Back" }).click();
  await profileRow(page, "Work").click();
  await expect(remove).toBeEnabled();
  await enabled.click();

  // Signed out, as its mail check finds once it is enabled again.
  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, asleep, sign in required"
  );
  await expect(switchNamed(page, "Sleep")).toBeChecked();
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("a disabled profile's page and the list with one, light and dark", async ({
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
      { id: "side-project", name: "Side project", disabled: true },
    ]);
    const page = await openSettings(app);

    await openProfiles(page);
    await expect(profileRow(page, "Side project")).toHaveAccessibleDescription(
      "Disabled"
    );

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-profiles-disabled", theme),
      });
    }

    await profileRow(page, "Side project").click();
    await expect(switchNamed(page, "Enabled")).not.toBeChecked();

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-profile-page-disabled", theme),
      });
    }
  });
});
