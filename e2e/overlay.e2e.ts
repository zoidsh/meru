import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import { overlayRectangle } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";

import {
  clickMenuItem,
  expect,
  findPage,
  findOverlayDocument,
  test,
} from "./lib/app.ts";
import { CALENDAR_TITLE, DRAFT_LABEL } from "./lib/stand-in.ts";

/**
 * Lets `document.hasFocus()` in the page say whether it holds Chromium's
 * keyboard focus, which Playwright otherwise makes every page claim. The
 * suite's app is never the active app, so this is as near as a test gets to
 * where a key would go: the window is never the one the system types into.
 */
const followRealFocus = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });

  return () => page.evaluate(() => document.hasFocus());
};

/** The overlay's view, the page the shell's own frame opened by that name. */
const readOverlayView = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    const children = window?.contentView.children ?? [];
    // A crashed page's frame throws when read.
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in main, which sees nothing outside
    const nameOf = (view: Electron.View) => {
      try {
        return (view as Electron.WebContentsView).webContents?.mainFrame.name;
      } catch {
        return "";
      }
    };
    const index = children.findIndex((view) => nameOf(view) === "meru-overlay");
    const view = children[index] as Electron.WebContentsView | undefined;

    return {
      visible: view?.getVisible(),
      url: view?.webContents.getURL(),
      children: children.length,
      onTop: index === children.length - 1,
      bounds: view?.getBounds(),
      area: window?.contentView.getBounds(),
      sharesShellProcess:
        view?.webContents.getOSProcessId() ===
        window?.webContents.getOSProcessId(),
    };
  });

/** Whether main has the overlay's view as the one keys go to. */
const overlayIsFocused = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .some(
        (contents) =>
          contents.mainFrame.name === "meru-overlay" && contents.isFocused()
      )
  );

/** As the system hands keys to the page, which Playwright's keyboard is not. */
const typeInto = (app: ElectronApplication, url: string, text: string) =>
  app.evaluate(
    ({ webContents }, { pageUrl, characters }) => {
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(pageUrl));

      for (const keyCode of characters) {
        page?.sendInputEvent({ type: "char", keyCode });
      }
    },
    { pageUrl: url, characters: [...text] }
  );

/**
 * A key in the overlay's view as the system hands it there, so its view
 * hears it first; a letter also types.
 */
const keyInOverlay = (
  app: ElectronApplication,
  keyCode: string,
  modifiers: ("control" | "shift" | "meta")[] = []
) =>
  app.evaluate(
    ({ webContents }, request) => {
      const overlay = webContents
        .getAllWebContents()
        .find((candidate) => candidate.mainFrame.name === "meru-overlay");
      const types =
        request.keyCode.length === 1 && request.modifiers.length === 0
          ? (["keyDown", "char", "keyUp"] as const)
          : (["keyDown", "keyUp"] as const);

      for (const type of types) {
        overlay?.sendInputEvent({
          type,
          keyCode: request.keyCode,
          modifiers: request.modifiers,
        });
      }
    },
    { keyCode, modifiers }
  );

const field = (overlay: Page) =>
  overlay.getByRole("combobox", { name: "New tab" });

/** Opens New tab, a card over the page, from the menu. */
const openFromMenu = async (app: ElectronApplication, overlay: Page) => {
  await clickMenuItem(app, "app.open");
  await expect(field(overlay)).toBeFocused();
};

const expectClosed = async (app: ElectronApplication, overlay: Page) => {
  await expect(overlay.getByRole("dialog")).toHaveCount(0);
  const view = await readOverlayView(app);

  expect(view.visible).toBeFalsy();
};

test("at launch the page has focus; New tab from the menu shows its card over it in the shell's process, Escape closes it, and focus goes back to the page", async ({
  app,
  shell,
  standIn,
}) => {
  const gmail = await findPage(app, standIn.url);
  const overlay = await findOverlayDocument(app);
  const gmailHasFocus = await followRealFocus(gmail);
  const shellHasFocus = await followRealFocus(shell);
  const overlayHasFocus = await followRealFocus(overlay);
  const draft = gmail.getByRole("textbox", { name: DRAFT_LABEL });

  // Typing reaches the page without a click.
  await expect.poll(gmailHasFocus).toBeTruthy();
  expect(await shellHasFocus()).toBeFalsy();
  expect(await readOverlayView(app)).toMatchObject({ visible: false });
  // The overlay's document is the one thing the shell may open.
  expect(
    await shell.evaluate(() => [
      window.open("about:blank", "elsewhere") === null,
      window.open("https://example.com/") === null,
    ])
  ).toStrictEqual([true, true]);
  // The shell draws into it; it has no bridge to main of its own.
  expect(await overlay.evaluate(() => "meru" in window)).toBeFalsy();

  await draft.focus();
  await openFromMenu(app, overlay);

  await expect(overlay.getByRole("dialog", { name: "New tab" })).toBeVisible();
  await expect(field(overlay)).toHaveValue("");
  await expect.poll(overlayHasFocus).toBeTruthy();
  expect(await gmailHasFocus()).toBeFalsy();

  const view = await readOverlayView(app);

  expect(view).toMatchObject({
    visible: true,
    onTop: true,
    sharesShellProcess: true,
  });
  expect(view.bounds).toStrictEqual(
    overlayRectangle(
      view.area ?? { width: 0, height: 0 },
      "hidden",
      process.platform as Platform,
      {
        kind: "open-app",
      }
    )
  );

  await overlay.keyboard.press("Escape");

  await expectClosed(app, overlay);
  await expect.poll(gmailHasFocus).toBeTruthy();
  // Asked of main, not of the overlay's document, which on Linux, hidden
  // while it had focus, can go on believing it has it though main has moved
  // focus, where the keys go, to the page.
  expect(await overlayIsFocused(app)).toBe(false);

  // The page kept its own focused field.
  await typeInto(app, standIn.url, "hi");
  await expect(draft).toHaveValue("hi");

  // Opening a page by the overlay's own name leaves the overlay's document,
  // which draws the next card. Last, and read through `evaluate`, since
  // Playwright waits on the refused navigation as though it were under way.
  await shell.evaluate(() => {
    window.open("https://example.com/", "meru-overlay");
  });
  await clickMenuItem(app, "app.open");
  await expect
    .poll(() =>
      overlay.evaluate(() => [
        document.querySelector("h2")?.textContent,
        document.activeElement?.getAttribute("role"),
      ])
    )
    .toStrictEqual(["New tab", "combobox"]);
  expect(await readOverlayView(app)).toMatchObject({
    url: "about:blank",
    visible: true,
  });
});

test("Escape, a click beside the card, a tab switch and the window losing focus each close it", async ({
  app,
  shell,
  standIn,
}) => {
  const gmail = await findPage(app, standIn.url);
  const draft = gmail.getByRole("textbox", { name: DRAFT_LABEL });

  // A reloaded shell opens a new overlay document, which its styles reach.
  const first = await findOverlayDocument(app);

  await shell.reload();
  await expect.poll(() => first.isClosed()).toBeTruthy();

  const overlay = await findOverlayDocument(app);

  await openFromMenu(app, overlay);
  expect(
    await overlay
      .getByRole("dialog", { name: "New tab" })
      .evaluate((card) => [
        getComputedStyle(card).backgroundColor,
        getComputedStyle(card.ownerDocument.body).backgroundColor,
      ])
  ).toStrictEqual(["oklch(1 0 0)", "rgba(0, 0, 0, 0)"]);
  await overlay.keyboard.press("Escape");
  await expectClosed(app, overlay);

  // A click beside the card, over the page, closes it and stops there.
  await draft.focus();
  await openFromMenu(app, overlay);
  await overlay.mouse.click(8, 400);
  await expectClosed(app, overlay);
  await expect(draft).toBeFocused();
  await expect(draft).toHaveValue("");

  // Losing the window's focus closes it.
  await openFromMenu(app, overlay);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.emit("blur");
  });
  await expectClosed(app, overlay);

  // A command that switches tab closes it, and the new tab's page has focus.
  await gmail.getByRole("link", { name: "Open Calendar" }).click();
  await expect(
    shell.getByRole("tab", { name: CALENDAR_TITLE, selected: true })
  ).toBeVisible();

  const calendarHasFocus = await followRealFocus(
    await findPage(app, standIn.calendarUrl)
  );

  await openFromMenu(app, overlay);
  await clickMenuItem(app, "tab.next");
  await expectClosed(app, overlay);
  await expect(
    shell.getByRole("tab", { name: CALENDAR_TITLE, selected: false })
  ).toBeVisible();
  expect(await calendarHasFocus()).toBeFalsy();
  await expect.poll(await followRealFocus(gmail)).toBeTruthy();
});

test("in New tab's field a plain letter types, and a command's key acts once on the tab underneath", async ({
  app,
  shell,
  standIn,
}) => {
  const gmail = await findPage(app, standIn.url);
  const overlay = await findOverlayDocument(app);
  const calendarSelected = (selected: boolean) =>
    expect(
      shell.getByRole("tab", { name: CALENDAR_TITLE, selected })
    ).toBeVisible();

  await gmail.getByRole("link", { name: "Open Calendar" }).click();
  await calendarSelected(true);

  await openFromMenu(app, overlay);
  await field(overlay).fill("");
  await keyInOverlay(app, "x");
  await expect(field(overlay)).toHaveValue("x");

  // Next tab, which run twice would wrap back to Calendar.
  await keyInOverlay(app, "Tab", ["control"]);
  await expectClosed(app, overlay);
  await calendarSelected(false);
  await delay(500);
  await calendarSelected(false);
});

test("when the shell's renderer is gone, the overlay's view goes with it, and the shell main loads again opens a new one with nothing left open", async ({
  app,
  standIn,
}) => {
  await findPage(app, standIn.url);

  const first = await findOverlayDocument(app);

  await openFromMenu(app, first);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer();
  });
  await expect
    .poll(() =>
      app
        .windows()
        .some((page) => page !== first && page.url() === "about:blank")
    )
    .toBeTruthy();
  expect(first.isClosed()).toBeTruthy();

  const overlay = await findOverlayDocument(app);

  await expect(overlay.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => {
      const { visible } = await readOverlayView(app);

      return visible;
    })
    .toBe(false);
  await openFromMenu(app, overlay);
});
