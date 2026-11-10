/*
 * Settings opens in a window of its own, beside the main window rather than in
 * place of what it shows, and there is only ever one of it.
 */
import { expect, type Page, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp();

function readWindows() {
  return meru.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((window) => !window.webContents.isDestroyed())
      .map((window) => ({
        id: window.id,
        url: window.webContents.getURL(),
      })),
  );
}

async function findSettingsPage() {
  await expect
    .poll(() => meru.app.windows().some((window) => window.url().includes("settings.html")))
    .toBe(true);

  return meru.app.windows().find((window) => window.url().includes("settings.html")) as Page;
}

/** Called on the settings window's own `focus`, so it reads the same with the app kept behind. */
function spyOnSettingsWindowFocus() {
  return meru.app.evaluate(({ BrowserWindow }) => {
    const settingsWindow = BrowserWindow.getAllWindows()
      .filter((window) => !window.webContents.isDestroyed())
      .find((window) => window.webContents.getURL().includes("settings.html"));

    if (!settingsWindow) {
      throw new Error("There is no settings window");
    }

    const focus = settingsWindow.focus.bind(settingsWindow);

    Reflect.set(globalThis, "__settingsWindowFocused", false);

    settingsWindow.focus = () => {
      Reflect.set(globalThis, "__settingsWindowFocused", true);

      focus();
    };
  });
}

function readSettingsWindow() {
  return meru.app.evaluate(({ BrowserWindow }) => {
    const settingsWindow = BrowserWindow.getAllWindows()
      .filter((window) => !window.webContents.isDestroyed())
      .find((window) => window.webContents.getURL().includes("settings.html"));

    if (!settingsWindow) {
      throw new Error("There is no settings window");
    }

    return {
      id: settingsWindow.id,
      isMaximizable: settingsWindow.isMaximizable(),
      isMinimizable: settingsWindow.isMinimizable(),
      isFullScreenable: settingsWindow.isFullScreenable(),
    };
  });
}

function resizeSettingsWindow(width: number, height: number) {
  return meru.app.evaluate(
    ({ BrowserWindow }, size) => {
      const settingsWindow = BrowserWindow.getAllWindows()
        .filter((window) => !window.webContents.isDestroyed())
        .find((window) => window.webContents.getURL().includes("settings.html"));

      settingsWindow?.setSize(size.width, size.height);

      return settingsWindow?.getSize() ?? [0, 0];
    },
    { width, height },
  );
}

/** Whether the selected account's Gmail view is attached to the main window and showing. */
function readSelectedAccountViewVisible() {
  return meru.app.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()
      .filter((window) => !window.webContents.isDestroyed())
      .find((window) => window.webContents.getURL().includes("main.html"));

    return (
      mainWindow?.contentView.children.some((child) => {
        const { webContents } = child as Electron.WebContentsView;

        return Boolean(webContents?.getURL().startsWith("http")) && child.getVisible();
      }) ?? false
    );
  });
}

test("settings opens in one window of its own and leaves the main window as it was", async () => {
  const mainPageUrl = meru.renderer.url();

  const windowsBefore = await readWindows();

  expect(await meru.runMenuCommand({ accelerator: "CommandOrControl+," })).toBe(true);

  const settingsPage = await findSettingsPage();

  expect(await readWindows()).toHaveLength(windowsBefore.length + 1);

  await expect(settingsPage.getByTestId("settings-nav")).toBeVisible();

  await expect(settingsPage.getByText("Settings", { exact: true }).first()).toBeVisible();

  await expect(settingsPage).toHaveURL(/#\/settings\/general$/);

  expect(new URL(meru.renderer.url()).hash).toMatch(/^(#\/?)?$/);

  expect(meru.renderer.url()).toBe(mainPageUrl);

  await expect.poll(readSelectedAccountViewVisible).toBe(true);

  // A second request reuses the window, brings it forward, and moves it to the page asked for.
  const { id: settingsWindowId } = await readSettingsWindow();

  await spyOnSettingsWindowFocus();

  expect(await meru.runMenuCommand({ accelerator: "CommandOrControl+," })).toBe(true);

  await expect
    .poll(() => meru.app.evaluate(() => Reflect.get(globalThis, "__settingsWindowFocused")))
    .toBe(true);

  expect(await readWindows()).toHaveLength(windowsBefore.length + 1);

  expect((await readSettingsWindow()).id).toBe(settingsWindowId);

  expect(await meru.runMenuCommand("About Meru")).toBe(true);

  await expect(settingsPage).toHaveURL(/#\/settings\/about$/);

  expect(await readWindows()).toHaveLength(windowsBefore.length + 1);

  expect(new URL(meru.renderer.url()).hash).toMatch(/^(#\/?)?$/);
});

test("the settings window keeps to its size limits and cannot be maximized", async () => {
  expect(await meru.runMenuCommand({ accelerator: "CommandOrControl+," })).toBe(true);

  await findSettingsPage();

  const [largestWidth, largestHeight] = await resizeSettingsWindow(3000, 3000);

  expect(largestWidth).toBeLessThanOrEqual(1200);
  expect(largestHeight).toBeLessThanOrEqual(900);

  const [smallestWidth, smallestHeight] = await resizeSettingsWindow(100, 100);

  expect(smallestWidth).toBeGreaterThanOrEqual(720);
  expect(smallestHeight).toBeGreaterThanOrEqual(480);

  const settingsWindow = await readSettingsWindow();

  expect(settingsWindow.isFullScreenable).toBe(false);

  // Electron implements neither on Linux, where both always read true.
  if (process.platform !== "linux") {
    expect(settingsWindow.isMaximizable).toBe(false);
    expect(settingsWindow.isMinimizable).toBe(false);
  }
});

test("closing the settings window leaves the main window open", async () => {
  const mainPageUrl = meru.renderer.url();

  const windowsBefore = await readWindows();

  expect(await meru.runMenuCommand({ accelerator: "CommandOrControl+," })).toBe(true);

  await findSettingsPage();

  await meru.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .filter((window) => !window.webContents.isDestroyed())
      .find((window) => window.webContents.getURL().includes("settings.html"))
      ?.close();
  });

  await expect.poll(readWindows).toEqual(windowsBefore);

  expect(meru.renderer.url()).toBe(mainPageUrl);

  await expect.poll(readSelectedAccountViewVisible).toBe(true);
});

test("a page asked for while the window is still loading is the one it lands on", async () => {
  expect(await meru.runMenuCommand({ accelerator: "CommandOrControl+," })).toBe(true);

  expect(await meru.runMenuCommand("About Meru")).toBe(true);

  const settingsPage = await findSettingsPage();

  await expect(settingsPage.getByTestId("settings-title")).toHaveText("About Meru");

  await expect(settingsPage).toHaveURL(/#\/settings\/about$/);
});
