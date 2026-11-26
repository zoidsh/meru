// GitHub's list of releases comes from the suite build's stand-in, which a
// test answers; no test reaches GitHub or the default browser.
import type { ElectronApplication, Page } from "@playwright/test";

import {
  expect,
  readOpenedExternally,
  stubSystemBrowser,
  test,
  writeSettings,
} from "./lib/app.ts";
import {
  GITHUB_RELEASES,
  NOTES_LINK,
  STABLE_TAGS,
  answerReleases,
  releasesAsked,
} from "./lib/releases.ts";
import { openSection, openSettings } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

const openAbout = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openSection(page, "About");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("About");

  return page;
};

const dialogOf = (page: Page) =>
  page.getByRole("dialog", { name: "What's new" });

const showWhatsNew = async (page: Page) => {
  await page
    .getByRole("group", { name: "Updates" })
    .getByRole("button", { name: "Show", exact: true })
    .click();

  const dialog = dialogOf(page);

  await expect(dialog).toBeVisible();

  return dialog;
};

const releaseOf = (dialog: ReturnType<typeof dialogOf>, tag: string) =>
  dialog.getByRole("article", { name: tag, exact: true });

test("What's new lists Meru's releases newest first in a dialog, a beta only if it runs, the running one marked", async ({
  app,
}) => {
  await answerReleases(app, GITHUB_RELEASES);

  const page = await openAbout(app);
  const dialog = await showWhatsNew(page);

  await expect(
    dialog.getByRole("article").getByRole("heading", { level: 3 })
  ).toHaveText(STABLE_TAGS);
  await expect(
    releaseOf(dialog, "v4.0.0-dev.0").getByText("Current version")
  ).toBeVisible();
  await expect(dialog.getByText("Current version")).toHaveCount(1);
  await expect(releaseOf(dialog, "v4.0.2").getByRole("time")).toHaveText(
    "November 18, 2026"
  );
  await expect(
    releaseOf(dialog, "v4.0.1").getByRole("heading", { name: "Fixes" })
  ).toBeVisible();

  // The list scrolls inside the dialog, which stays within the window.
  const box = await dialog.boundingBox();
  const height = await page.evaluate(() => window.innerHeight);

  expect(box?.height).toBeLessThanOrEqual(height);
  await expect(releaseOf(dialog, "v3.6.0")).not.toBeInViewport();

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});

test("the notes keep their formatting and shortcut keys, run and load nothing of their own, and their web link opens in the default browser", async ({
  app,
}) => {
  await answerReleases(app, GITHUB_RELEASES);

  const page = await openAbout(app);
  const dialog = await showWhatsNew(page);
  const notes = releaseOf(dialog, "v4.0.2");

  for (const key of ["Cmd", "K"]) {
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await expect(notes.getByText(key, { exact: true })).toHaveJSProperty(
      "tagName",
      "KBD"
    );
  }

  await expect(notes.getByText("bold", { exact: true })).toBeVisible();
  await expect(notes.getByRole("img")).toHaveCount(0);
  await expect(notes.getByText("ran")).toHaveCount(0);
  await expect(page).not.toHaveTitle("ran");
  // A script link keeps its words and is no link.
  await expect(notes.getByText("A script link")).toBeVisible();
  await expect(notes.getByRole("link", { name: "A script link" })).toHaveCount(
    0
  );

  await stubSystemBrowser(app);

  const before = page.url();

  await notes.getByRole("link", { name: "the issue" }).click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([NOTES_LINK]);
  // Settings stays where it was.
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(before);
});

test("on the Beta channel What's new lists the betas too", async ({
  launchApp,
  userDataDir,
}) => {
  await writeSettings(userDataDir, { updateChannel: "beta" });

  const app = await launchApp();

  await answerReleases(app, GITHUB_RELEASES);

  const page = await openAbout(app);
  const dialog = await showWhatsNew(page);

  await expect(
    dialog.getByRole("article").getByRole("heading", { level: 3 })
  ).toHaveText(["v4.1.0-beta.1", ...STABLE_TAGS]);
});

test("What's new shows a placeholder while the notes load, says when they could not, and Try again lists them; GitHub is asked once a run", async ({
  app,
}) => {
  await answerReleases(app, "fail", true);

  const page = await openAbout(app);
  const dialog = await showWhatsNew(page);

  await expect(
    dialog.getByRole("status", { name: "Loading what's new" })
  ).toBeVisible();
  await answerReleases(app, "fail");
  await expect(
    dialog.getByText("Couldn't load what's new.", { exact: true })
  ).toBeVisible();

  await answerReleases(app, GITHUB_RELEASES);
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByRole("article")).toHaveCount(STABLE_TAGS.length);

  await dialog.getByRole("button", { name: "Done" }).click();
  await showWhatsNew(page);
  await expect(dialog.getByRole("article")).toHaveCount(STABLE_TAGS.length);
  expect(await releasesAsked(app)).toBe(2);
});

/** The window with the dialog in each theme, as `name`. */
const shoot = async (app: ElectronApplication, page: Page, name: string) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one theme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one after another
    await page.screenshot({ path: shotPath(name, theme) });
  }
};

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the list, light and dark", async ({ app }) => {
    await answerReleases(app, GITHUB_RELEASES);

    const page = await openAbout(app);
    const dialog = await showWhatsNew(page);

    await expect(dialog.getByRole("article")).toHaveCount(STABLE_TAGS.length);
    await shoot(app, page, "settings-about-whats-new");
  });

  test("loading, light and dark", async ({ app }) => {
    await answerReleases(app, GITHUB_RELEASES, true);

    const page = await openAbout(app);
    const dialog = await showWhatsNew(page);

    await expect(
      dialog.getByRole("status", { name: "Loading what's new" })
    ).toBeVisible();
    await shoot(app, page, "settings-about-whats-new-loading");
  });

  test("failed, light and dark", async ({ app }) => {
    const page = await openAbout(app);
    const dialog = await showWhatsNew(page);

    await expect(
      dialog.getByText("Couldn't load what's new.", { exact: true })
    ).toBeVisible();
    await shoot(app, page, "settings-about-whats-new-failed");
  });
});
