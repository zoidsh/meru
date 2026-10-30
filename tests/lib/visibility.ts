/*
 * Whether each account's view is the one on screen, as the page inside it sees
 * that: `document.visibilityState`, which is what Gmail itself reads. A view
 * the app put in front that came back stacked underneath reports "hidden" and
 * stops painting while the view behind it shows. Read through
 * `useUnattachedApp`, because a page Playwright is attached to reports
 * "visible" whatever happens.
 */
import { ms } from "@meru/shared/ms";
import { expect, test } from "@playwright/test";
import type { UnattachedApp } from "./unattached-app";

/** How long a view is given to report the state the window is in once it has loaded. */
const STATE_TIMEOUT = ms("15s");

const MINIMIZE_TIMEOUT = ms("5s");

/** Each account view's `document.visibilityState`, by the account id its session is partitioned on. */
function readVisibilityStates(meru: UnattachedApp) {
  return meru.evaluate(async ({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    const states = await Promise.all(
      window.contentView.children.map(async (child) => {
        const { webContents } = child as Electron.WebContentsView;

        const accountId = (webContents.session.storagePath ?? "").split(/[\\/]/).at(-1);

        const state: string = await webContents.executeJavaScript("document.visibilityState");

        return [accountId, state] as const;
      }),
    );

    return Object.fromEntries(states);
  });
}

function expectStates(meru: UnattachedApp, expected: Record<string, unknown>, message: string) {
  return expect
    .poll(() => readVisibilityStates(meru), { message, timeout: STATE_TIMEOUT })
    .toEqual(expected);
}

/**
 * Waits for every account view to have loaded the stand-in, so a state read
 * after it is the page's own rather than the blank document before it.
 */
export async function waitForAccountViews(meru: UnattachedApp, accountIds: string[]) {
  await expect
    .poll(() =>
      meru.evaluate(({ BrowserWindow }) =>
        (BrowserWindow.getAllWindows()[0]?.contentView.children ?? []).map((child) => {
          const { webContents } = child as Electron.WebContentsView;

          return webContents.getURL() !== "" && !webContents.isLoading();
        }),
      ),
    )
    .toEqual(accountIds.map(() => true));
}

/**
 * The selected account's view reports "visible". On Linux every other view
 * reports "hidden" as well, because Chromium there counts a view covered by
 * another as occluded, and a view stacked wrongly shows there as the wrong one
 * visible. macOS reports a covered view "visible", so elsewhere the others are
 * left unchecked.
 */
export async function expectOnScreen(
  meru: UnattachedApp,
  accountIds: string[],
  selectedAccountId: string,
) {
  const expected = Object.fromEntries(
    accountIds.map((accountId) => [
      accountId,
      accountId === selectedAccountId
        ? "visible"
        : process.platform === "linux"
          ? "hidden"
          : expect.any(String),
    ]),
  );

  await expectStates(meru, expected, `only ${selectedAccountId}'s view is on screen`);
}

/**
 * Every view reports "hidden", which a window off screen makes true on every
 * platform. Asserted on the way through a step, so the state after it is known
 * to be one the views went into rather than one they were held in.
 */
async function expectAllHidden(meru: UnattachedApp, accountIds: string[]) {
  await expectStates(
    meru,
    Object.fromEntries(accountIds.map((accountId) => [accountId, "hidden"])),
    "every view is hidden while the window is off screen",
  );
}

/**
 * Clicks the account's item in the Accounts menu, which is what its Alt+1 to
 * Alt+9 shortcut on Linux runs. Clicked on the next tick, because the menu is
 * rebuilt as the account changes and the reply would go with it.
 */
export async function selectAccountFromMenu(meru: UnattachedApp, label: string) {
  const found = await meru.evaluate(({ Menu }, accountLabel) => {
    const accountsMenu = Menu.getApplicationMenu()?.items.find(
      (menuItem) => menuItem.label === "Accounts",
    );

    const menuItem = accountsMenu?.submenu?.items.find(
      (accountItem) => accountItem.label === accountLabel,
    );

    if (menuItem) {
      setImmediate(() => {
        menuItem.click();
      });
    }

    return Boolean(menuItem);
  }, label);

  expect(found, `the Accounts menu has ${label}`).toBe(true);
}

/**
 * Minimizes the window and restores it, which runs the app's `restore` handler.
 * Skips the test on Linux when nothing minimizes the window: CI runs it under
 * xvfb with no window manager, and there neither call does anything. Anywhere
 * else a window that stays up fails the test.
 */
export async function minimizeAndRestore(meru: UnattachedApp, accountIds: string[]) {
  await meru.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.minimize();
  });

  const minimized = await expect
    .poll(
      () => meru.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMinimized()),
      {
        timeout: MINIMIZE_TIMEOUT,
      },
    )
    .toBe(true)
    .then(() => true)
    .catch(() => false);

  test.skip(
    !minimized && process.platform === "linux",
    "the window manager did not minimize the window",
  );

  expect(minimized, "the window minimized").toBe(true);

  await expectAllHidden(meru, accountIds);

  await meru.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.restore();
  });
}

/**
 * Closes the window, which hides it, and brings it back the way a second launch
 * does: the new process hands over to this one through `second-instance`, and
 * the app shows its window. Xvfb has no tray, which is the other way back.
 */
export async function closeAndReopen(meru: UnattachedApp, accountIds: string[]) {
  await meru.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });

  await expectAllHidden(meru, accountIds);

  await meru.launchSecondInstance();
}
