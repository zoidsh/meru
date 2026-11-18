import type { ElectronApplication, Locator, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readMenuItem,
  readState,
  readViews,
  test,
  writeState,
} from "./lib/app.ts";
import { ANY_SESSION, CALENDAR_TITLE, GRABBY_PATH } from "./lib/stand-in.ts";

const isMacOS = process.platform === "darwin";

/** As `overlay.e2e.ts`: whether the page holds Chromium's keyboard focus. */
const followRealFocus = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });

  return () => page.evaluate(() => document.hasFocus());
};

/** Cmd+T or Ctrl+T in the page at `url`, as the system hands keys to it. */
const pressOpenApp = (app: ElectronApplication, url: string) =>
  app.evaluate(
    ({ webContents }, request) => {
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(request.url));

      for (const type of ["keyDown", "keyUp"] as const) {
        page?.sendInputEvent({
          type,
          keyCode: "T",
          modifiers: [request.modifier],
        });
      }
    },
    { url, modifier: isMacOS ? ("meta" as const) : ("control" as const) }
  );

const nothingOpen = (shell: Page) =>
  shell.getByRole("region", { name: "No apps open" });

const options = (overlay: Page) => overlay.getByRole("option");

const readTabs = async (userDataDir: string) => {
  const { profiles } = await readState<{
    profiles: { tabs: { app: string }[]; selectedTabId: string }[];
  }>(userDataDir);

  return profiles[0]?.tabs.map((tab) => tab.app);
};

test("Cmd or Ctrl+T opens Open app over the page, listing every app but the profile's Gmail; typing filters, the arrows and Enter open one as a tab with its page focused, and a second press closes it", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  await findPage(app, standIn.url);
  const overlay = await findOverlayDocument(app);
  const overlayHasFocus = await followRealFocus(overlay);
  const field = overlay.getByRole("combobox", { name: "Open app" });

  await pressOpenApp(app, standIn.url);
  await expect(overlay.getByRole("dialog", { name: "Open app" })).toBeVisible();
  await expect(field).toBeFocused();
  await expect.poll(overlayHasFocus).toBeTruthy();
  await expect(overlay.getByRole("listbox", { name: "Apps" })).toBeVisible();
  await expect(options(overlay)).toHaveText([
    "Calendar",
    "Drive",
    "Docs",
    "Sheets",
    "Slides",
    "Meet",
  ]);

  await field.fill("zz");
  await expect(overlay.getByText("No apps found.")).toBeVisible();
  await expect(options(overlay)).toHaveCount(0);

  await field.fill("S");
  await expect(options(overlay)).toHaveText(["Docs", "Sheets", "Slides"]);

  await field.fill("cal");
  await expect(options(overlay)).toHaveText(["Calendar"]);
  await field.press("Enter");

  const calendar = await findPage(app, standIn.calendarUrl);
  const calendarHasFocus = await followRealFocus(calendar);

  await expect(overlay.getByRole("dialog")).toHaveCount(0);
  await expect.poll(calendarHasFocus).toBeTruthy();
  await expect
    .poll(() => readTabs(userDataDir))
    .toStrictEqual(["gmail", "calendar"]);
  await expect(
    shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { selected: true })
  ).toHaveAccessibleName(CALENDAR_TITLE);

  // Calendar may have more than one tab, so it is still listed.
  await pressOpenApp(app, standIn.calendarUrl);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");
  await expect(options(overlay)).toHaveText([
    "Calendar",
    "Drive",
    "Docs",
    "Sheets",
    "Slides",
    "Meet",
  ]);
  // A person's second press lands in the overlay's document, which only the
  // menu's accelerator hears.
  await clickMenuItem(app, "app.open");
  await expect(overlay.getByRole("dialog")).toHaveCount(0);

  await pressOpenApp(app, standIn.calendarUrl);
  await field.press("ArrowDown");
  await field.press("ArrowDown");
  await field.press("ArrowUp");
  await expect(
    overlay.getByRole("option", { name: "Drive", selected: true })
  ).toBeVisible();
  await field.press("Enter");

  const drive = await findPage(app, standIn.driveUrl);

  await expect.poll(await followRealFocus(drive)).toBeTruthy();
  await expect
    .poll(() => readTabs(userDataDir))
    .toStrictEqual(["gmail", "calendar", "drive"]);
});

test("Open app is first in the titlebar's right-hand group while the sidebar is hidden and below the last tab while it shows, pressed while open; a second click closes it, and Escape gives focus back to the page", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      { id: "a", name: "Default" },
      { id: "b", name: "Work" },
    ],
    selectedProfileId: "a",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const gmail = await findPage(app, standIn.url);
  const gmailHasFocus = await followRealFocus(gmail);
  const overlay = await findOverlayDocument(app);
  const header = shell.getByRole("banner", { name: "Title bar" });
  const titlebarButton = header.getByRole("button", { name: "Open app" });
  const sidebar = shell.getByRole("tablist", { name: "Tabs" });
  const dialog = overlay.getByRole("dialog", { name: "Open app" });

  await expect(titlebarButton).toHaveAttribute("title", /^Open app \(.+T\)$/u);

  const [open, inbox] = await Promise.all(
    [titlebarButton, header.getByRole("button", { name: "Unified inbox" })].map(
      (button) => button.boundingBox()
    )
  );

  // Right before Unified inbox, 4px apart.
  expect(
    Math.round((inbox?.x ?? 0) - (open?.x ?? 0) - (open?.width ?? 0))
  ).toBe(4);

  await titlebarButton.click();
  await expect(dialog).toBeVisible();
  await overlay.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect.poll(gmailHasFocus).toBeTruthy();

  await titlebarButton.click();
  await expect(dialog).toBeVisible();
  await expect(titlebarButton).toHaveAttribute("aria-pressed", "true");
  await titlebarButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(titlebarButton).toHaveAttribute("aria-pressed", "false");

  await header.getByRole("button", { name: "Sidebar", exact: true }).click();
  await expect(sidebar).toBeVisible();
  await expect(titlebarButton).toHaveCount(0);

  const sidebarButton = shell.getByRole("button", { name: "Open app" });

  await expect(sidebarButton).toHaveCount(1);
  await sidebarButton.click();
  await expect(dialog).toBeVisible();
  await expect(sidebarButton).toHaveAttribute("aria-pressed", "true");
  await sidebarButton.click();
  await expect(dialog).toHaveCount(0);

  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await expect(sidebarButton).toHaveText("Open app");

  await header.getByRole("button", { name: "Sidebar", exact: true }).click();
  await expect(sidebar).toHaveCount(0);
  await expect(titlebarButton).toBeVisible();
});

test("Gmail, unpinned, closes like any tab, leaving No apps open, focus in the shell and Close Tab off, and Open app there lists it to open again; a relaunch keeps it all", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  standIn.setFeed(ANY_SESSION, { unreadCount: 0 });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.url);
  const shellHasFocus = await followRealFocus(shell);
  const menuItem = (id: string) =>
    readMenuItem(app, id).then(({ label, enabled }) => [label, enabled]);
  const stored = () =>
    readState<{
      profiles: { tabs: object[]; selectedTabId: string }[];
    }>(userDataDir).then(({ profiles: [profile] }) => [
      profile?.tabs,
      profile?.selectedTabId,
    ]);

  expect([
    await menuItem("tab.pin"),
    await menuItem("tab.close"),
  ]).toStrictEqual([
    ["Unpin Tab", true],
    ["Close Tab", false],
  ]);

  await clickMenuItem(app, "tab.pin");
  await expect
    .poll(() => menuItem("tab.close"))
    .toStrictEqual(["Close Tab", true]);
  await clickMenuItem(app, "tab.close", standIn.url);

  await expect
    .poll(() => readViews(app).then(({ views }) => views))
    .toStrictEqual([]);
  // The suite's app is never active on macOS, where the window's own page then takes no focus.
  if (!isMacOS) {
    await expect.poll(shellHasFocus).toBeTruthy();
  }
  await expect.poll(stored).toStrictEqual([[], ""]);
  await expect(nothingOpen(shell)).toBeVisible();
  await expect(
    nothingOpen(shell).getByText(
      "Open Gmail, Calendar or another Google app in this profile."
    )
  ).toBeVisible();
  expect([
    await menuItem("tab.pin"),
    await menuItem("tab.close"),
  ]).toStrictEqual([
    ["Pin Tab", false],
    ["Close Tab", false],
  ]);
  await app.close();

  const second = await launchApp();
  const secondShell = await findPage(second, "meru-app:");
  const secondOverlay = await findOverlayDocument(second);

  await expect
    .poll(() => readViews(second).then(({ views }) => views))
    .toStrictEqual([]);
  await expect(
    secondShell
      .getByRole("banner", { name: "Title bar" })
      .getByRole("button", { name: "Open app" })
  ).toBeVisible();
  await nothingOpen(secondShell)
    .getByRole("button", { name: "Open app" })
    .click();
  await expect(options(secondOverlay)).toHaveText([
    "Gmail",
    "Calendar",
    "Drive",
    "Docs",
    "Sheets",
    "Slides",
    "Meet",
  ]);
  await secondOverlay.getByRole("option", { name: "Gmail" }).click();

  await findPage(second, standIn.url);
  await expect(nothingOpen(secondShell)).toHaveCount(0);
  await expect.poll(stored).toStrictEqual([
    [
      {
        id: "gmail",
        app: "gmail",
        url: standIn.url,
        title: expect.any(String),
        pinned: false,
      },
    ],
    "gmail",
  ]);
});

/**
 * Which of the named pages holds Chromium's keyboard focus, each followed
 * for real; main's `isFocused` is false for all under the test flag, whose
 * app is never active.
 */
const focusHolders = async (pages: Record<string, Page>) => {
  const holding = await Promise.all(
    Object.entries(pages).map(async ([name, page]) =>
      (await page.evaluate(() => document.hasFocus())) ? [name] : []
    )
  );

  return holding.flat();
};

test("Open app's field has focus over a split whose other page takes focus as it loads and whenever it loses it, and keeps it once the pages settle", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const grabbyUrl = `${standIn.driveUrl}${GRABBY_PATH.slice(1)}`;

  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
          { id: "d", app: "drive", url: grabbyUrl, title: "" },
        ],
        selectedTabId: "d",
        splits: [
          {
            root: {
              direction: "row",
              children: [
                { size: 0.5, pane: "c" },
                { size: 0.5, pane: "d" },
              ],
            },
          },
        ],
      },
    ],
    selectedProfileId: "p",
  });

  const app = await launchApp();
  const calendar = await findPage(app, standIn.calendarUrl);
  const grabby = await findPage(app, grabbyUrl);
  const overlay = await findOverlayDocument(app);

  // Every page as Chromium has it, so the stand-in's grab is real.
  await followRealFocus(calendar);
  await followRealFocus(grabby);
  await followRealFocus(overlay);

  /**
   * Each page taking focus after a card took it, as a page's own grab does
   * where the app is active, which the suite's never is; then the card's
   * field has it, checked again a while later, since such a grab comes late.
   */
  const keepsFocus = async (field: Locator) => {
    await expect(field).toBeFocused();

    for (const url of [grabbyUrl, standIn.calendarUrl]) {
      // oxlint-disable-next-line no-await-in-loop -- one page after the other
      await app.evaluate(({ webContents }, pageUrl) => {
        webContents
          .getAllWebContents()
          .find((contents) => contents.getURL().startsWith(pageUrl))
          ?.focus();
      }, url);
      // The card takes it back on the next turn, so a second grab before
      // then would land while the first is still being undone.
      // oxlint-disable-next-line no-await-in-loop -- one page after the other
      await expect
        .poll(() => focusHolders({ calendar, grabby, overlay }))
        .toStrictEqual(["overlay"]);
    }

    for (let check = 0; check < 5; check += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one check after another
      await expect(field).toBeFocused();
      // oxlint-disable-next-line no-await-in-loop -- one check after another
      await expect
        .poll(() => focusHolders({ calendar, grabby, overlay }))
        .toStrictEqual(["overlay"]);
      // oxlint-disable-next-line no-await-in-loop -- one check after another
      await delay(200);
    }
  };

  await expect
    .poll(() => grabby.evaluate(() => document.activeElement?.id))
    .toBe("grabby");
  await pressOpenApp(app, grabbyUrl);
  await expect(overlay.getByRole("dialog", { name: "Open app" })).toBeVisible();
  await keepsFocus(overlay.getByRole("combobox", { name: "Open app" }));

  await overlay.keyboard.press("Escape");
  await expect(overlay.getByRole("dialog")).toHaveCount(0);
  await clickMenuItem(app, "profile.rename");
  await keepsFocus(overlay.getByRole("textbox", { name: "Rename profile" }));
});
