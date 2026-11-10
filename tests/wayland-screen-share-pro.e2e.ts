/*
 * Under Wayland, the screen share picker opened while the main window is closed
 * to the tray, and so with a hidden window as its parent, closes without taking
 * the app with it: no window is left on screen, the main process still answers,
 * the page's request is refused, and the window comes back with the Meet tab on
 * screen. An error thrown in the main process as the picker closes puts up a
 * modal error box, which holds the main thread and with it the tray.
 *
 * Unattached, because a page Playwright is attached to reads "visible"
 * whatever its window does. Pro, because the picker opens only for a Meet tab,
 * a workspace app; the Meet page is served in the account's own session, so
 * nothing reaches Google. The window is closed and the picker dismissed
 * through sway, as a user's compositor would: sway's seat pointer does not
 * reach the picker's buttons.
 */
import { ms } from "@meru/shared/ms";
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { requireLicenseKey, withTimeout } from "./lib/app";
import { useSwayDisplay } from "./lib/sway";
import { useUnattachedApp } from "./lib/unattached-app";

const APP_ID = "meru";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac03";

const MEET_URL = "https://meet.google.com/";

const ANSWER_TIMEOUT = ms("5s");

const STEP_TIMEOUT = ms("10s");

const sway = useSwayDisplay();

const meru = useUnattachedApp(
  {
    "screenShare.useSystemPicker": false,
    licenseKey: requireLicenseKey(),
    accounts: [seedAccount({ id: ACCOUNT_ID, label: "Personal" })],
  },
  { args: ["--ozone-platform=wayland"] },
);

function runInMeet(source: string) {
  return meru.evaluate(
    async ({ webContents }, { meetUrl, script }) => {
      const meet = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().startsWith(meetUrl));

      if (!meet) {
        throw new Error("No view has the Meet page loaded");
      }

      return (await meet.executeJavaScript(script, true)) as unknown;
    },
    { meetUrl: MEET_URL, script: source },
  );
}

async function readAppViews() {
  return (await sway.readViews()).filter(({ app_id }) => app_id === APP_ID);
}

type Picker = { parentIsHidden: boolean; title: string };

function readPickers(): Promise<Picker[]> {
  return meru.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((window) => window.webContents.getURL().includes("desktop-sources"))
      .map((window) => ({
        parentIsHidden: window.getParentWindow()?.isVisible() === false,
        title: window.getTitle(),
      })),
  );
}

/** `document.visibilityState` of each of the main window's views, by its page's origin. */
function readViewStates() {
  return meru.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes("main.html"),
    );

    if (!window) {
      throw new Error("The app has no main window");
    }

    const states = await Promise.all(
      window.contentView.children.map(async (child) => {
        const { webContents } = child as Electron.WebContentsView;

        const state: string = await webContents.executeJavaScript("document.visibilityState");

        return [new URL(webContents.getURL()).origin, state] as const;
      }),
    );

    return Object.fromEntries(states);
  });
}

test("the screen share picker closed under a window closed to the tray leaves the app answering", async () => {
  await meru.evaluate(({ session }, partition) => {
    session.fromPartition(partition).protocol.handle(
      "https",
      () =>
        new Response("<!doctype html><title>Meet Stand-In</title>", {
          headers: { "content-type": "text/html" },
        }),
    );
  }, `persist:${ACCOUNT_ID}`);

  await test.step("the main window maps", async () => {
    await expect
      .poll(async () => (await readAppViews()).map(({ visible }) => visible), {
        message: "sway's tree holds one visible window for the app",
        timeout: STEP_TIMEOUT,
      })
      .toEqual([true]);
  });

  await test.step("Meet opens in a tab", async () => {
    // What the workspace apps launcher's Meet button sends.
    await meru.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes("main.html"))
        ?.webContents.executeJavaScript(
          `window.electron.ipcRenderer.send("workspaceApps.openApp", "meet")`,
        ),
    );

    await expect
      .poll(
        () =>
          meru.evaluate(
            ({ webContents }, meetUrl) =>
              webContents
                .getAllWebContents()
                .some((contents) => contents.getURL().startsWith(meetUrl) && !contents.isLoading()),
            MEET_URL,
          ),
        { message: "a view loaded the Meet stand-in", timeout: STEP_TIMEOUT },
      )
      .toBe(true);
  });

  await test.step("closing the window through sway hides it to the tray", async () => {
    await sway.swaymsg(`[app_id="${APP_ID}"]`, "kill");

    await expect
      .poll(
        async () => ({
          mapped: (await readAppViews()).length,
          visible: await meru.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().map((window) => window.isVisible()),
          ),
        }),
        {
          message: "sway's tree holds no window for the app, and its one window is hidden",
          timeout: STEP_TIMEOUT,
        },
      )
      .toEqual({ mapped: 0, visible: [false] });
  });

  // Started with a user gesture, which Chromium requires of a screen share
  // request. It settles only once the picker closes, so the script ends on
  // `undefined` rather than the promise `executeJavaScript` would wait on.
  await runInMeet(`
    window.__share = "pending";
    navigator.mediaDevices.getDisplayMedia({ video: true }).then(
      () => { window.__share = "resolved"; },
      (error) => { window.__share = "rejected: " + error.name; },
    );
    undefined;
  `);

  await test.step("the picker maps with the hidden window as its parent", async () => {
    await expect
      .poll(readPickers, {
        message: "the app has one picker window, its parent hidden",
        timeout: STEP_TIMEOUT,
      })
      .toEqual([{ parentIsHidden: true, title: expect.any(String) }]);

    const [{ title }] = (await readPickers()) as [Picker];

    await expect
      .poll(async () => (await readAppViews()).map(({ name, visible }) => ({ name, visible })), {
        message: "sway's tree holds the picker alone, visible",
        timeout: STEP_TIMEOUT,
      })
      .toEqual([{ name: title, visible: true }]);
  });

  await test.step("the picker closes through sway", async () => {
    const [picker] = await readAppViews();

    if (!picker) {
      throw new Error("sway's tree no longer holds the picker");
    }

    await sway.swaymsg(`[con_id=${picker.id}]`, "kill");

    // Read from sway alone, which answers whatever state the app is in.
    await expect
      .poll(async () => (await readAppViews()).map(({ name }) => name), {
        message:
          "sway's tree holds no window for the app. A window named \"Error\" is the main process's uncaught-exception box, which holds the main thread and prints nothing to stderr: see the picker's close handler, `windowListener` in packages/app/account.ts, which answers with `callback(null)`",
        timeout: STEP_TIMEOUT,
      })
      .toEqual([]);
  });

  await test.step("the main process still answers", async () => {
    expect(
      await withTimeout(
        meru.evaluate(() => true),
        ANSWER_TIMEOUT,
      ).catch(() => false),
      `the main process answered within ${ANSWER_TIMEOUT}ms of the picker closing; a hung browser process answers nothing, the tray included`,
    ).toBe(true);

    expect(await readPickers(), "the picker windows the app still has").toEqual([]);

    await expect
      .poll(() => runInMeet("window.__share"), {
        message: "the page's screen share request settled as refused",
        timeout: STEP_TIMEOUT,
      })
      .toMatch(/^rejected: /);
  });

  await test.step("the window comes back with the Meet tab on screen", async () => {
    await meru.launchSecondInstance();

    await expect
      .poll(async () => (await readAppViews()).map(({ visible }) => visible), {
        message: "sway's tree holds the main window again, visible",
        timeout: STEP_TIMEOUT,
      })
      .toEqual([true]);

    await expect
      .poll(readViewStates, {
        message: "the Meet tab's view, the one in front, reads visible",
        timeout: STEP_TIMEOUT,
      })
      .toMatchObject({ [new URL(MEET_URL).origin]: "visible" });
  });
});
