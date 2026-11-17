import type { ElectronApplication, Page } from "@playwright/test";

import { overlayRectangle } from "#core/overlay.ts";

import {
  clickMenuItem,
  expect,
  findPage,
  findShellDocument,
  readMenuLabel,
  readState,
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

const readNames = async (userDataDir: string) => {
  const { profiles } = await readState<{ profiles: { name: string }[] }>(
    userDataDir
  );

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
  await expect(overlay.getByRole("dialog")).toHaveCount(0);
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
  const overlay = await findShellDocument(app, "meru-overlay");
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
    overlay.getByRole("dialog", { name: "Rename profile" })
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
    overlayRectangle(view.area ?? { width: 0, height: 0 }, "hidden")
  );

  await overlay.keyboard.type("  Work ");
  await overlay.keyboard.press("Enter");

  // With one profile the titlebar has no row; the Window menu names it.
  await expect.poll(() => readMenuLabel(app, "profile.select.1")).toBe("Work");
  await expect.poll(() => readNames(userDataDir)).toStrictEqual(["Work"]);
  await expectClosed(app, overlay);
  await expect.poll(gmailHasFocus).toBeTruthy();
  expect(await overlayHasFocus()).toBeFalsy();

  // The page kept its own focused field.
  await typeInto(app, standIn.url, "hi");
  await expect(draft).toHaveValue("hi");

  // Opening a page by the overlay's own name leaves the overlay's document,
  // which draws the next rename. Last, and read through `evaluate`, since
  // Playwright waits on the refused navigation as though it were under way.
  await shell.evaluate(() => {
    window.open("https://example.com/", "meru-overlay");
  });
  await clickMenuItem(app, "profile.rename");
  await expect
    .poll(() =>
      overlay.evaluate(() => [
        document.body.textContent,
        document.activeElement?.getAttribute("name"),
      ])
    )
    .toStrictEqual(["Rename profile", "name"]);
  expect(await readOverlayView(app)).toMatchObject({
    url: "about:blank",
    visible: true,
  });
});

test("Escape, a click beside the card, a tab switch and the window losing focus each close it and leave the name", async ({
  app,
  shell,
  standIn,
  userDataDir,
}) => {
  const gmail = await findPage(app, standIn.url);
  const draft = gmail.getByRole("textbox", { name: DRAFT_LABEL });

  // A reloaded shell opens a new overlay document, which its styles reach.
  const first = await findShellDocument(app, "meru-overlay");

  await shell.reload();
  await expect.poll(() => first.isClosed()).toBeTruthy();

  const overlay = await findShellDocument(app, "meru-overlay");

  // Emptied, Escape keeps the name.
  await openFromMenu(app, overlay);
  expect(
    await overlay
      .getByRole("dialog", { name: "Rename profile" })
      .evaluate((card) => [
        getComputedStyle(card).backgroundColor,
        getComputedStyle(card.ownerDocument.body).backgroundColor,
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

  expect(await readMenuLabel(app, "profile.select.1")).toBe("Default");
  expect(await readNames(userDataDir)).toStrictEqual(["Default"]);
});

test("when the shell's renderer is gone, the overlay's view goes with it and nothing is left open", async ({
  app,
  standIn,
}) => {
  await findPage(app, standIn.url);

  const first = await findShellDocument(app, "meru-overlay");

  await openFromMenu(app, first);

  const before = await readOverlayView(app);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer();
  });
  await expect
    .poll(async () => {
      const after = await readOverlayView(app);

      return after.children;
    })
    .toBe(before.children - 1);
  expect(await readOverlayView(app)).toMatchObject({ visible: undefined });

  // A shell loaded again draws no overlay, since main has none open.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.reload();
  });
  await expect
    .poll(() =>
      app
        .windows()
        .some((page) => page !== first && page.url() === "about:blank")
    )
    .toBeTruthy();

  const overlay = await findShellDocument(app, "meru-overlay");

  await expect(overlay.getByRole("dialog")).toHaveCount(0);
  await openFromMenu(app, overlay);
});
