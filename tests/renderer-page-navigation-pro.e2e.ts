/*
 * The screen share picker is a renderer page too, with the same preload and
 * so the same IPC bridge, and holds to what every other one does: it stays on
 * its own document, and reaches the browser only with a web link. The rest of
 * the renderer pages are in `renderer-page-navigation.e2e.ts`.
 *
 * Under a license, because the picker opens only for a Google Meet tab, which
 * is a workspace app. The Meet page is served in the account's own session,
 * so the view, its session and the request it makes are the app's own while
 * nothing reaches Google.
 */
import { expect, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useProApp } from "./lib/app";
import {
  expectNavigationOpensInBrowser,
  expectNewWindowOpensOnlyWebLinks,
  expectReturnFromNavigation,
  findRendererPage,
  stubBrowser,
} from "./lib/renderer-navigation";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

const MEET_URL = "https://meet.google.com/e2e-picker";

/** Titled apart from the app's label, so the tab reading it proves the page arrived. */
const MEET_PAGE_TITLE = "Meet Stand-In";

const meru = useProApp({
  // The system picker answers on the operating system's side and never opens
  // Meru's page.
  "screenShare.useSystemPicker": false,
  accounts: [
    seedAccount({
      id: ACCOUNT_ID,
      label: "Personal",
      savedTabs: [seedSavedTab({ app: "meet", url: MEET_URL, title: "Meet" })],
    }),
  ],
});

test.beforeEach(async () => {
  await stubBrowser(meru);
});

async function openPicker() {
  await meru.app.evaluate(
    ({ desktopCapturer, session }, { partition, title }) => {
      session.fromPartition(partition).protocol.handle(
        "https",
        () =>
          new Response(`<!doctype html><title>${title}</title>`, {
            headers: { "content-type": "text/html" },
          }),
      );

      // The picker lists sources through this, which on macOS asks for the
      // screen recording permission, a prompt no test is here to answer.
      desktopCapturer.getSources = async () => [];
    },
    { partition: `persist:${ACCOUNT_ID}`, title: MEET_PAGE_TITLE },
  );

  await meru.renderer.getByRole("button", { name: "Meet" }).click();

  await expect(meru.renderer.getByRole("button", { name: MEET_PAGE_TITLE })).toBeVisible();

  // With a user gesture, which Chromium requires of a screen share request.
  await meru.app.evaluate(({ webContents }, meetUrl) => {
    webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL() === meetUrl)
      ?.executeJavaScript("navigator.mediaDevices.getDisplayMedia({ video: true })", true)
      .catch(() => undefined);
  }, MEET_URL);

  return findRendererPage(meru, "desktop-sources");
}

test("a navigation away from the screen share picker opens in the browser and leaves it where it was", async () => {
  await expectNavigationOpensInBrowser(meru, await openPicker());
});

test("a new window from the screen share picker opens in the browser only for a web link", async () => {
  await expectNewWindowOpensOnlyWebLinks(meru, await openPicker());
});

test("the screen share picker comes back from about:blank with its bridge", async () => {
  await expectReturnFromNavigation(meru, await openPicker(), "about:blank");
});
