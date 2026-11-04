/*
 * The renderer pages other than the main window's, which load with the same
 * preload and so hold the same IPC bridge: a popup, and the chrome of a
 * workspace app opened as its own window. Each stays on its own document, and
 * reaches the browser only with a web link. The main window's side is in
 * `main-window-navigation.e2e.ts`, and the screen share picker's, which needs
 * a workspace app, in `renderer-page-navigation-pro.e2e.ts`.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import {
  expectNavigationOpensInBrowser,
  expectNewWindowOpensOnlyWebLinks,
  expectReturnFromNavigation,
  findRendererPage,
  stubBrowser,
} from "./lib/renderer-navigation";

const meru = useApp();

test.beforeEach(async () => {
  await stubBrowser(meru);
});

const surfaces = {
  popup: async () => {
    await meru.renderer.getByTitle("Show recent download history").click();

    return findRendererPage(meru, "recent-download-history");
  },
  // A compose window is a workspace app opened as a window, and the one the
  // menu reaches without a license.
  "workspace app window": async () => {
    expect(await meru.runMenuCommand("Report Issue…")).toBe(true);

    return findRendererPage(meru, "workspace-app");
  },
};

for (const [surface, openSurface] of Object.entries(surfaces)) {
  test(`a navigation away from the ${surface} opens in the browser and leaves it where it was`, async () => {
    await expectNavigationOpensInBrowser(meru, await openSurface());
  });

  test(`a new window from the ${surface} opens in the browser only for a web link`, async () => {
    await expectNewWindowOpensOnlyWebLinks(meru, await openSurface());
  });

  test(`the ${surface} comes back from about:blank with its bridge`, async () => {
    await expectReturnFromNavigation(meru, await openSurface(), "about:blank");
  });
}
