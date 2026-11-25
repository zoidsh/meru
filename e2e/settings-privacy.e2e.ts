import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { expect, test, writeSettings } from "./lib/app.ts";
import { openSection, openSettings, switchNamed } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

const SITES = ["https://a.example", "https://b.example", "https://c.example"];

/** As many as the dialog shows before its list scrolls, and more. */
const MANY_SITES = [
  "https://github.com",
  "https://www.figma.com",
  "https://linear.app",
  "https://www.notion.so",
  "https://zoom.us",
  "https://www.dropbox.com",
  "https://slack.com",
  "https://www.atlassian.com",
  "https://stripe.com",
  "https://vercel.com",
  "https://www.wikipedia.org",
  "http://intranet.example:8080",
];

const readStored = async (userDataDir: string) => {
  try {
    return JSON.parse(
      await readFile(path.join(userDataDir, "settings.json"), "utf-8")
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const storedValue = async (userDataDir: string, key: string) => {
  const stored = await readStored(userDataDir);

  return stored[key];
};

const openPrivacy = async (page: Page) => {
  await openSection(page, "Privacy & Security");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Privacy & Security"
  );
};

const manage = (page: Page) =>
  page.getByRole("button", { name: "Manage trusted sites" });

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Trusted sites" });

const remove = (page: Page, site: string) =>
  dialog(page).getByRole("button", { name: `Remove ${site}` });

const done = (page: Page) => dialog(page).getByRole("button", { name: "Done" });

const launchWithSites = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  sites: readonly string[]
) => {
  await writeSettings(userDataDir, { trustedSites: sites });

  const app = await launchApp();
  const page = await openSettings(app);

  await openPrivacy(page);

  return { app, page };
};

test("opens from the sidebar with its two groups, each holding its rows, and no scopes", async ({
  app,
}) => {
  const page = await openSettings(app);

  await openPrivacy(page);
  await expect(page.getByRole("tablist")).toHaveCount(0);

  const blocker = page.getByRole("group", { name: "Content blocker" });

  await expect(blocker).toHaveAccessibleDescription(
    "Works on every page in Meru, including Gmail."
  );
  await expect(
    blocker.getByRole("switch", { name: "Block ads" })
  ).toBeChecked();
  await expect(
    blocker.getByRole("switch", { name: "Block trackers" })
  ).toHaveAccessibleDescription(
    "Stops scripts that follow you from site to site."
  );

  const links = page.getByRole("group", { name: "Links" });

  await expect(
    links.getByRole("switch", { name: "Ask before opening links" })
  ).toHaveAccessibleDescription(
    "Meru asks before a link opens in your default browser."
  );
  await expect(
    links.getByRole("button", { name: "Manage trusted sites" })
  ).toBeEnabled();
  await expect(manage(page)).toHaveAccessibleDescription(
    "You haven't trusted any sites yet."
  );
});

test("each switch shows the stored value and writes the one it is turned to, the blocker's two apart", async ({
  launchApp,
  userDataDir,
}) => {
  await writeSettings(userDataDir, { blockTrackers: false });

  const app = await launchApp();
  const page = await openSettings(app);

  await openPrivacy(page);
  await expect(switchNamed(page, "Block ads")).toBeChecked();
  await expect(switchNamed(page, "Block trackers")).not.toBeChecked();

  await switchNamed(page, "Block ads").click();
  await expect.poll(() => storedValue(userDataDir, "blockAds")).toBe(false);
  await expect(switchNamed(page, "Block trackers")).not.toBeChecked();
  await expect(switchNamed(page, "Block trackers")).toBeEnabled();

  await switchNamed(page, "Block trackers").click();
  await switchNamed(page, "Ask before opening links").click();
  await expect
    .poll(async () => {
      const stored = await readStored(userDataDir);

      return [stored.blockAds, stored.blockTrackers, stored.confirmLinks];
    })
    .toStrictEqual([false, true, false]);
});

test("Trusted sites counts the sites, and is disabled saying why while Ask before opening links is off", async ({
  launchApp,
  userDataDir,
}) => {
  const { page } = await launchWithSites(launchApp, userDataDir, SITES);

  await expect(manage(page)).toHaveAccessibleDescription(
    "Links to 3 sites open without asking."
  );

  await switchNamed(page, "Ask before opening links").click();
  await expect(manage(page)).toBeDisabled();
  await expect(manage(page)).toHaveAccessibleDescription(
    "Turn on Ask before opening links first."
  );

  await switchNamed(page, "Ask before opening links").click();
  await expect(manage(page)).toBeEnabled();
});

test("the dialog lists each site by its host, focuses the first Remove, and a removal moves focus to the next row's, else to Done", async ({
  launchApp,
  userDataDir,
}) => {
  const { page } = await launchWithSites(launchApp, userDataDir, [
    ...SITES,
    "http://d.example:8080",
  ]);

  await manage(page).click();
  await expect(dialog(page)).toHaveAccessibleDescription(
    "Links to these sites open without asking."
  );
  await expect(
    dialog(page).getByRole("table", { name: "Trusted sites" }).getByRole("row")
  ).toHaveText(["a.example", "b.example", "c.example", "d.example:8080"]);
  await expect(remove(page, "a.example")).toBeFocused();

  await remove(page, "b.example").click();
  await expect(remove(page, "b.example")).toHaveCount(0);
  await expect(remove(page, "c.example")).toBeFocused();

  await remove(page, "d.example:8080").click();
  await expect(done(page)).toBeFocused();
  await expect
    .poll(() => storedValue(userDataDir, "trustedSites"))
    .toStrictEqual(["https://a.example", "https://c.example"]);
  await page.keyboard.press("Enter");
  await expect(manage(page)).toHaveAccessibleDescription(
    "Links to 2 sites open without asking."
  );
});

test("removing every site shows the empty state, and Done closes the dialog with focus back on Manage…", async ({
  launchApp,
  userDataDir,
}) => {
  const { page } = await launchWithSites(launchApp, userDataDir, [
    "https://a.example",
  ]);

  await manage(page).click();
  await remove(page, "a.example").click();

  await expect(dialog(page).getByText("No trusted sites")).toBeVisible();
  await expect(
    dialog(page).getByText("Sites you trust when Meru asks show up here.")
  ).toBeVisible();
  await expect(done(page)).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveCount(0);
  await expect(manage(page)).toBeFocused();
  await expect(manage(page)).toHaveAccessibleDescription(
    "You haven't trusted any sites yet."
  );
  expect(await storedValue(userDataDir, "trustedSites")).toStrictEqual([]);
});

test("the keyboard stays inside the dialog, and Escape closes it with focus back on Manage…", async ({
  launchApp,
  userDataDir,
}) => {
  const { page } = await launchWithSites(launchApp, userDataDir, SITES);

  await manage(page).click();
  await expect(remove(page, "a.example")).toBeFocused();

  for (const name of ["b.example", "c.example"]) {
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await page.keyboard.press("Tab");
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await expect(remove(page, name)).toBeFocused();
  }

  await page.keyboard.press("Tab");
  await expect(done(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(remove(page, "a.example")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(manage(page)).toBeFocused();
});

test("Go to Profiles opens the Profiles section, and Back returns here", async ({
  app,
}) => {
  const page = await openSettings(app);

  await openPrivacy(page);
  await expect(
    page.getByText(
      "You can delete cookies and cached files for each profile on its page."
    )
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to Profiles" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Profiles");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Privacy & Security"
  );
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the page, the dialog with sites and empty, light and dark", async ({
    launchApp,
    userDataDir,
  }) => {
    const { app, page } = await launchWithSites(
      launchApp,
      userDataDir,
      MANY_SITES
    );
    const shoot = async (surface: string) => {
      for (const theme of THEMES) {
        // oxlint-disable-next-line no-await-in-loop -- one theme at a time
        await emulateTheme(app, theme);
        // oxlint-disable-next-line no-await-in-loop -- one after another
        await page.screenshot({ path: shotPath(surface, theme) });
      }
    };

    await shoot("settings-privacy");

    await manage(page).click();
    await expect(remove(page, "github.com")).toBeFocused();
    await shoot("settings-privacy-sites");

    for (const site of MANY_SITES) {
      // oxlint-disable-next-line no-await-in-loop -- one removal after another
      await remove(page, new URL(site).host).click();
    }

    await expect(dialog(page).getByText("No trusted sites")).toBeVisible();
    await shoot("settings-privacy-sites-empty");
  });
});
