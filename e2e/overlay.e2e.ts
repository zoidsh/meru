import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { overlayRectangle } from "#core/overlay.ts";

import { expect, findPage, test } from "./lib/app.ts";
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

const readNames = async (userDataDir: string) => {
  const { profiles } = JSON.parse(
    await readFile(path.join(userDataDir, "state.json"), "utf-8")
  ) as { profiles: { name: string }[] };

  return profiles.map((profile) => profile.name);
};

/** The overlay's view, the page the shell's own frame opened. */
const readOverlayView = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    const children = window?.contentView.children ?? [];
    const index = children.findIndex(
      (view) =>
        (view as Electron.WebContentsView).webContents.opener ===
        window?.webContents.mainFrame
    );
    const view = children[index] as Electron.WebContentsView | undefined;

    return {
      visible: view?.getVisible(),
      onTop: index === children.length - 1,
      bounds: view?.getBounds(),
      area: window?.contentView.getBounds(),
      sharesShellProcess:
        view?.webContents.getOSProcessId() ===
        window?.webContents.getOSProcessId(),
    };
  });

const clickMenuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu, BrowserWindow }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);

    if (!item) {
      throw new Error(`The application menu has no ${itemId}`);
    }

    item.click(undefined, BrowserWindow.getAllWindows()[0]);
  }, id);

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

const field = (overlay: Page) =>
  overlay.getByRole("textbox", { name: "Rename profile" });

const openFromMenu = async (app: ElectronApplication, overlay: Page) => {
  await clickMenuItem(app, "profile.rename");
  await expect(field(overlay)).toBeFocused();
};

const expectClosed = async (app: ElectronApplication, overlay: Page) => {
  await expect(overlay.getByRole("form")).toHaveCount(0);
  const view = await readOverlayView(app);

  expect(view.visible).toBeFalsy();
};

test("at launch the page has focus; Rename from the Window menu shows the name selected over it in the shell's process, Enter renames, and focus goes back to the page", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  const gmail = await findPage(app, standIn.url);
  const overlay = await findPage(app, "about:blank");
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

  await expect(
    overlay.getByRole("form", { name: "Rename profile" })
  ).toBeVisible();
  await expect(overlay.getByText("Rename profile")).toBeVisible();
  await expect(field(overlay)).toHaveValue("Default");
  expect(
    await field(overlay).evaluate((input: HTMLInputElement) => [
      input.selectionStart,
      input.selectionEnd,
    ])
  ).toStrictEqual([0, "Default".length]);
  await expect.poll(overlayHasFocus).toBeTruthy();
  expect(await gmailHasFocus()).toBeFalsy();

  const view = await readOverlayView(app);

  expect(view).toMatchObject({
    visible: true,
    onTop: true,
    sharesShellProcess: true,
  });
  expect(view.bounds).toStrictEqual(
    overlayRectangle(view.area ?? { width: 0, height: 0 }, "modern", {
      kind: "rename-profile",
      profileId: "",
    })
  );

  await overlay.keyboard.type("  Work ");
  await overlay.keyboard.press("Enter");

  await expect(shell.getByRole("tab", { name: "Work" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect.poll(() => readNames(userDataDir)).toStrictEqual(["Work"]);
  await expectClosed(app, overlay);
  await expect.poll(gmailHasFocus).toBeTruthy();
  expect(await overlayHasFocus()).toBeFalsy();

  // The page kept its own focused field.
  await typeInto(app, standIn.url, "hi");
  await expect(draft).toHaveValue("hi");
});

/**
 * Stands in for the native menu, which would show on the desktop: a
 * popped-up menu is kept for the test to click an item of.
 */
const keepPoppedUpMenus = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => {
    const menus: Electron.Menu[] = [];

    Reflect.set(globalThis, "poppedUpMenus", menus);
    Menu.prototype.popup = function popup(this: Electron.Menu) {
      menus.push(this);
    };
  });

const clickPoppedUpItem = (app: ElectronApplication, label: string) =>
  app.evaluate((_electron, itemLabel) => {
    const menus = Reflect.get(globalThis, "poppedUpMenus") as Electron.Menu[];

    menus
      .at(-1)
      ?.items.find((item) => item.label === itemLabel)
      ?.click();
  }, label);

test("Escape, a click on the page, a tab switch and the window losing focus each close it and leave the name", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  const gmail = await findPage(app, standIn.url);
  const draft = gmail.getByRole("textbox", { name: DRAFT_LABEL });

  // A reloaded shell opens a new overlay document, which its styles reach.
  const first = await findPage(app, "about:blank");

  await shell.reload();
  await expect.poll(() => first.isClosed()).toBeTruthy();

  const overlay = await findPage(app, "about:blank");

  // From the profile's own menu, emptied: Escape keeps the name.
  await keepPoppedUpMenus(app);
  await shell.getByRole("tab", { name: "Default" }).click({ button: "right" });
  await clickPoppedUpItem(app, "Rename…");
  await expect(field(overlay)).toBeFocused();
  expect(
    await overlay
      .getByRole("form", { name: "Rename profile" })
      .evaluate((form) => [
        getComputedStyle(form).backgroundColor,
        getComputedStyle(form.ownerDocument.body).backgroundColor,
      ])
  ).toStrictEqual(["oklch(1 0 0)", "rgba(0, 0, 0, 0)"]);
  await field(overlay).fill("");
  await overlay.keyboard.press("Escape");
  await expectClosed(app, overlay);

  // Enter on an empty field changes nothing either.
  await openFromMenu(app, overlay);
  await field(overlay).fill(" ");
  await overlay.keyboard.press("Enter");
  await expectClosed(app, overlay);

  // A click on the page closes it and reaches the page.
  await openFromMenu(app, overlay);
  await draft.click();
  await expectClosed(app, overlay);
  await expect(draft).toBeFocused();

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

  await expect(shell.getByRole("tab", { name: "Default" })).toBeVisible();
  expect(await readNames(userDataDir)).toStrictEqual(["Default"]);
});
