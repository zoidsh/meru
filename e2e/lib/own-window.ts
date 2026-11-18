import type { ElectronApplication, Page } from "@playwright/test";

import {
  OWN_WINDOW_FIND_FRAME_PREFIX,
  OWN_WINDOW_FRAME_PREFIX,
} from "#core/own-window.ts";

import { expect } from "./app.ts";

/**
 * Each tab's own window: where it is, whether it shows, and each view in
 * it, its page or document's name, where it sits and whether it shows.
 */
export const readOwnWindows = (app: ElectronApplication) =>
  app.evaluate(({ BaseWindow, BrowserWindow }) =>
    BaseWindow.getAllWindows()
      .filter((window) => !(window instanceof BrowserWindow))
      .map((window) => ({
        bounds: window.getBounds(),
        visible: window.isVisible(),
        views: window.contentView.children.map((view) => {
          const { webContents } = view as Electron.WebContentsView;

          return {
            url: webContents.getURL(),
            name: webContents.mainFrame.name,
            bounds: view.getBounds(),
            visible: view.getVisible(),
          };
        }),
      }))
  );

/** The titlebar document of the tab's own window, which the shell draws into. */
export const findTitlebar = (app: ElectronApplication) =>
  findDocument(app, OWN_WINDOW_FRAME_PREFIX);

/** The find bar document of the tab's own window, while its bar is open. */
export const findWindowFind = (app: ElectronApplication) =>
  findDocument(app, OWN_WINDOW_FIND_FRAME_PREFIX);

const findDocument = async (app: ElectronApplication, prefix: string) => {
  let found: Page | undefined;

  await expect
    .poll(async () => {
      const blank = app
        .windows()
        .filter((page) => !page.isClosed() && page.url() === "about:blank");
      const names = await Promise.all(
        blank.map((page) => page.evaluate(() => window.name).catch(() => ""))
      );

      found = blank[names.findIndex((name) => name.startsWith(prefix))];

      return found !== undefined;
    })
    .toBe(true);

  return found as Page;
};
