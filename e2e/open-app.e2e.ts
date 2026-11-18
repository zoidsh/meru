import type { ElectronApplication, Page } from "@playwright/test";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readState,
  test,
  writeState,
} from "./lib/app.ts";
import { CALENDAR_TITLE } from "./lib/stand-in.ts";

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
