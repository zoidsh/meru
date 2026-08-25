/*
 * Proves the account view keeps filling the window when the window changes size.
 *
 * The view is a child of the window rather than part of the page, so nothing
 * lays it out on the window's behalf: the app has to hear that the window
 * resized and set the view's bounds itself. When it doesn't, the view keeps the
 * size it had and the window grows or shrinks out from under it.
 *
 * The harness that launches the app, and the reasoning behind how, lives in
 * `tests/lib/app.ts`.
 */
import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

/*
 * The minimum window size is lifted for these tests. It defaults to 912x512,
 * and a runner's display is not much bigger — the Windows one has a work area of
 * 1024x720 — which leaves under 120px of width to resize within, and a window
 * that barely changes size is a window the view can fail to follow undetectably.
 */
const meru = useApp({ "window.restrictMinimumSize": false });

/** How long a window manager is given to act on a maximize before it is taken as unsupported. */
const MAXIMIZE_TIMEOUT = 5_000;

function readLayout() {
  return meru.app.evaluate(({ BrowserWindow, screen }) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    return {
      // Logged with the rest, because the sizes below are derived from it and a
      // failure is read off a job log from a machine nobody can look at.
      workArea: screen.getDisplayMatching(window.getBounds()).workArea,
      // Both, because they differ on Windows — the window bounds there span the
      // invisible resize border that the content bounds stop short of, and only
      // the content bounds share a coordinate space with the child views.
      bounds: window.getBounds(),
      contentBounds: window.getContentBounds(),
      isMaximized: window.isMaximized(),
      views: window.contentView.children
        .filter((child) => child.getVisible())
        .map((child) => child.getBounds()),
    };
  });
}

/**
 * The space the account view leaves over on each side of the window's content
 * area. Zero on the right and at the bottom is the only correct answer: the view
 * starts below the titlebar and to the right of the tab strip, and spans
 * everything left. A view that missed a resize reports the pixels it is out by.
 */
async function readUnfilledSpace() {
  const layout = await readLayout();

  const [view] = layout.views;

  if (layout.views.length !== 1 || !view) {
    return `expected one visible account view, got ${layout.views.length}`;
  }

  return {
    top: view.y,
    right: layout.contentBounds.width - (view.x + view.width),
    bottom: layout.contentBounds.height - (view.y + view.height),
  };
}

async function expectViewToFillWindow(step: string) {
  try {
    // Polled rather than read once: the resize the app is reacting to reaches it
    // as an event, and the assertion is that it lands, not that it lands
    // synchronously.
    await expect
      .poll(readUnfilledSpace, {
        message: `the account view did not fill the window after ${step}`,
      })
      .toEqual({ top: APP_TITLEBAR_HEIGHT, right: 0, bottom: 0 });
  } finally {
    // In a `finally`, so the failing run logs them too. A failure on one platform
    // is read from the job log of a run nobody watched, and these numbers are the
    // whole diagnosis — which of the window's two bounds moved, and whether the
    // view moved with them.
    console.log(`[e2e] layout after ${step}: ${JSON.stringify(await readLayout())}`);
  }
}

/*
 * Waited for rather than assumed. `createView` attaches the view before it loads
 * anything into it, so this is reached long before Gmail is up — which is the
 * point, since a window resized during startup has to be honored too.
 */
async function waitForAccountView() {
  await expect.poll(async () => (await readLayout()).views.length).toBeGreaterThan(0);
}

/**
 * Sized as a fraction of the display rather than in pixels. A literal size is
 * either off-screen on a small runner or a barely perceptible change on a large
 * one, and neither tells you whether the view followed.
 */
async function resizeWindowTo(fractionOfWorkArea: number) {
  const { workArea } = await readLayout();

  await meru.app.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setBounds(size);
    },
    {
      width: Math.round(workArea.width * fractionOfWorkArea),
      height: Math.round(workArea.height * fractionOfWorkArea),
    },
  );
}

test("the account view follows the window as it is resized", async () => {
  await waitForAccountView();

  await expectViewToFillWindow("launch");

  // Both directions, because a view left at its old size fills the window it was
  // shrunk from and overflows the one it was grown from, and only one of those
  // is visible as a gap.
  await resizeWindowTo(0.6);

  await expectViewToFillWindow("shrinking the window");

  await resizeWindowTo(0.9);

  await expectViewToFillWindow("growing the window");
});

test("the account view follows the window into and out of maximize", async () => {
  await waitForAccountView();

  /*
   * Shrunk first, so that maximizing is a change of size at all. A window that
   * already fills the display maximizes to the size it was already, and the
   * assertion below would then hold without the view having had to follow
   * anything — which is what a runner with a small display hands you.
   */
  await resizeWindowTo(0.6);

  await expectViewToFillWindow("shrinking the window before maximizing");

  const restoredHeight = (await readLayout()).contentBounds.height;

  await meru.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize();
  });

  const maximized = await expect
    .poll(
      async () => {
        const layout = await readLayout();

        return layout.isMaximized && layout.contentBounds.height > restoredHeight;
      },
      { timeout: MAXIMIZE_TIMEOUT },
    )
    .toBe(true)
    .then(() => true)
    .catch(() => false);

  /*
   * Linux runs under xvfb, which has no window manager, so nothing there acts on
   * a maximize and the window keeps the size it had. Skipping says that plainly
   * rather than passing on an assertion that never got to mean anything.
   */
  test.skip(!maximized, "the window manager did not maximize the window to a larger size");

  await expectViewToFillWindow("maximizing the window");

  await meru.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.unmaximize();
  });

  await expect.poll(async () => (await readLayout()).isMaximized).toBe(false);

  await expectViewToFillWindow("unmaximizing the window");
});
