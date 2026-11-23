import type { Page } from "@playwright/test";

import { expect, test } from "./lib/app.ts";
import {
  launchWithMail,
  openProfiles,
  openSettings,
  pageLine,
  pollAll,
  profileRow,
} from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

const dialogOf = (page: Page) =>
  page.getByRole("alertdialog", { name: "Delete browsing data" });

const openDialog = async (page: Page) => {
  await page.getByRole("button", { name: "Delete browsing data…" }).click();

  const dialog = dialogOf(page);

  await expect(dialog).toBeVisible();

  return {
    dialog,
    cookies: dialog.getByRole("checkbox", {
      name: "Cookies and other site data",
    }),
    cache: dialog.getByRole("checkbox", { name: "Cached images and files" }),
    cancel: dialog.getByRole("button", { name: "Cancel" }),
    remove: dialog.getByRole("button", { name: "Delete data" }),
  };
};

const launchSignedIn = async (
  launchApp: Parameters<typeof launchWithMail>[0],
  userDataDir: string,
  standIn: Parameters<typeof launchWithMail>[2]
) => {
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
    },
  ]);
  const page = await openSettings(app);

  await openProfiles(page);
  await expect(profileRow(page, "Work")).toHaveAccessibleDescription(
    "work@example.com"
  );
  await profileRow(page, "Work").click();

  return { app, page };
};

test("Delete browsing data… asks with the cache checked and Cancel focused, needs one box checked, and Cancel or Escape deletes nothing", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { page } = await launchSignedIn(launchApp, userDataDir, standIn);
  const first = await openDialog(page);

  await expect(first.cookies).not.toBeChecked();
  await expect(first.cookies).toHaveAccessibleDescription(
    "Signs you out of Work."
  );
  await expect(first.cache).toBeChecked();
  await expect(first.cancel).toBeFocused();

  await first.cache.click();
  await expect(first.remove).toBeDisabled();
  await first.cookies.click();
  await expect(first.remove).toBeEnabled();

  await first.cancel.click();
  await expect(first.dialog).toBeHidden();

  const second = await openDialog(page);

  // Asked afresh, as it first was.
  await expect(second.cookies).not.toBeChecked();
  await expect(second.cache).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(second.dialog).toBeHidden();

  await expect(
    page.getByRole("button", { name: "Delete browsing data…" })
  ).toHaveAccessibleDescription(
    "This profile's cookies and site data, or its cached images and files."
  );
  await expect(
    pageLine(page, "Signed in to Google as work@example.com.")
  ).toBeVisible();
});

test("deleting the cache keeps the profile signed in, and deleting cookies signs it out", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, page } = await launchSignedIn(launchApp, userDataDir, standIn);
  const button = page.getByRole("button", { name: "Delete browsing data…" });
  const cacheOnly = await openDialog(page);

  await cacheOnly.remove.click();

  await expect(cacheOnly.dialog).toBeHidden();
  await expect(button).toHaveAccessibleDescription("Browsing data deleted.");
  await pollAll(app);
  await expect(
    pageLine(page, "Signed in to Google as work@example.com.")
  ).toBeVisible();

  const withCookies = await openDialog(page);

  await withCookies.cookies.click();
  await withCookies.remove.click();

  await expect(withCookies.dialog).toBeHidden();
  await expect(button).toHaveAccessibleDescription("Browsing data deleted.");
  // Polled at once, with no wait for the next round.
  await expect(
    pageLine(page, "Not signed in to Google, so its mail is not checked.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(profileRow(page, "Work")).toHaveAccessibleDescription(
    "Not signed in"
  );

  // The other profile's session keeps the stand-in's account cookie, read
  // there rather than through its status, which a poll that had not yet
  // landed would not change. Work's pages, reloaded, set the stand-in's
  // others again.
  await pollAll(app);
  await expect
    .poll(() =>
      app.evaluate(({ session }) =>
        Promise.all(
          ["persist:home", "persist:work"].map((partition) =>
            session
              .fromPartition(partition)
              .cookies.get({})
              .then((cookies) => cookies.some(({ name }) => name === "account"))
          )
        )
      )
    )
    .toStrictEqual([true, false]);
  await expect(profileRow(page, "Home")).toHaveAccessibleDescription(
    "home@example.org"
  );
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the Delete browsing data dialog, light and dark", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    const { app, page } = await launchSignedIn(launchApp, userDataDir, standIn);

    await openDialog(page);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-delete-browsing-data", theme),
      });
    }
  });
});
