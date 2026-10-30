/*
 * Ctrl and the mouse wheel zoom a view, as in Chrome.
 *
 * Chromium turns a Ctrl+wheel tick the page left alone into a zoom request on
 * the `WebContents`, which Electron passes on as `zoom-changed` and acts on no
 * further, so the view zooms only if the app listens. The wheel is sent into
 * each kind of view with `sendInputEvent`, the shape of Electron's own
 * `zoom-changed` test, because that is the one way to reach a `WebContentsView`'s
 * input from outside the app.
 *
 * Chromium compiles that path out on macOS, and the window there can never be
 * activated under `MERU_TEST_BACKGROUND`, so on macOS this holds only that the
 * wheel leaves the zoom alone.
 *
 * Under a license, because a workspace app view comes back only from a saved
 * tab, and saved tabs are restored only with a valid key.
 */
import { expect, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useProApp } from "./lib/app";
import { startTestServer, type TestServer } from "./lib/server";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

const WORKSPACE_APP_PAGE_TITLE = "Zoom Stand-In";

const zoomsOnWheel = process.platform !== "darwin";

let server: TestServer;

test.beforeAll(async () => {
  server = await startTestServer();
});

test.afterAll(async () => {
  await server.close();
});

const meru = useProApp(() => ({
  accounts: [
    seedAccount({
      id: ACCOUNT_ID,
      label: "First",
      savedTabs: [
        seedSavedTab({
          app: "calendar",
          url: server.pageUrl(WORKSPACE_APP_PAGE_TITLE),
          title: "Calendar",
          loadOnLaunch: true,
        }),
      ],
    }),
  ],
}));

/**
 * Sends one Ctrl+wheel tick into the middle of the view showing `url`, and
 * reports whether the window was focused for it, which `sendInputEvent` needs.
 */
function sendCtrlWheel(url: string, ticks: 1 | -1) {
  return meru.app.evaluate(
    ({ BrowserWindow }, { url, ticks }) => {
      const [window] = BrowserWindow.getAllWindows();

      if (!window) {
        throw new Error("The app has no window");
      }

      const view = window.contentView.children.find(
        (child) => (child as Electron.WebContentsView).webContents?.getURL() === url,
      ) as Electron.WebContentsView | undefined;

      if (!view) {
        throw new Error(`No view is showing ${url}`);
      }

      // `focus()` would raise the app on macOS past its background-only guard
      if (process.platform !== "darwin") {
        window.focus();
      }

      const { width, height } = view.getBounds();

      // Neither `canScroll: false` nor `hasPreciseScrollingDeltas: true`, since
      // Chromium zooms only on a wheel that could scroll and moves in whole ticks
      view.webContents.sendInputEvent({
        type: "mouseWheel",
        x: Math.round(width / 2),
        y: Math.round(height / 2),
        deltaX: 0,
        deltaY: ticks,
        wheelTicksX: 0,
        wheelTicksY: ticks,
        modifiers: ["control"],
      });

      return window.isFocused();
    },
    { url, ticks },
  );
}

function readViewZoomFactor(url: string) {
  return meru.app.evaluate(({ BrowserWindow }, url) => {
    const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find(
      (child) => (child as Electron.WebContentsView).webContents?.getURL() === url,
    ) as Electron.WebContentsView | undefined;

    return view?.webContents.getZoomFactor();
  }, url);
}

async function readGmailZoomFactor() {
  return (await meru.readConfig())["workspaceApps.zoomFactors"]?.gmail ?? 1;
}

async function expectWheelToZoom(url: string, readZoomFactor: () => Promise<number | undefined>) {
  const focused = await sendCtrlWheel(url, 1);

  if (!zoomsOnWheel) {
    // Nothing comes back to wait on when nothing happens, so give a stray zoom
    // the time a real one takes to land
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(await readZoomFactor()).toBe(1);

    expect((await meru.readConfig())["workspaceApps.zoomFactors"] ?? {}).toEqual({});

    return;
  }

  expect(focused, "the window took focus for the wheel").toBe(true);

  // Direction only: Electron's synthetic end-of-scroll event repeats the ticks,
  // so one send can zoom a step or two
  await expect.poll(readZoomFactor).toBeGreaterThan(1);

  const zoomedIn = (await readZoomFactor()) ?? 1;

  await sendCtrlWheel(url, -1);

  await expect.poll(readZoomFactor).toBeLessThan(zoomedIn);
}

test("Ctrl and the wheel zoom the Gmail view", async () => {
  const gmailUrl = meru.gmailStandIn.signInUrl;

  // Gmail applies its stored zoom on its first navigation, which would undo one
  // made before it
  await expect.poll(async () => (await readViewZoomFactor(gmailUrl)) !== undefined).toBe(true);

  await expectWheelToZoom(gmailUrl, readGmailZoomFactor);
});

test("Ctrl and the wheel zoom a workspace app view", async () => {
  const workspaceAppUrl = server.pageUrl(WORKSPACE_APP_PAGE_TITLE);

  // Opened, so its view is the visible one the wheel lands on
  await meru.renderer.getByRole("button", { name: WORKSPACE_APP_PAGE_TITLE }).click();

  await expect
    .poll(async () => (await readViewZoomFactor(workspaceAppUrl)) !== undefined)
    .toBe(true);

  await expectWheelToZoom(workspaceAppUrl, () => readViewZoomFactor(workspaceAppUrl));
});
