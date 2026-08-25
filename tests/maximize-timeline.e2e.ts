/*
 * TEMPORARY, Windows only. Times the two pixels.
 *
 * Maximizing on Windows leaves the account view short at the bottom: the app
 * lays out from a content height of 718 while the window settles at 720, and no
 * `resize` follows that last change because Electron gates the event on the
 * window bounds, which stopped moving before it. Sampling `maximize`,
 * `unmaximize` and a `setImmediate` after each read 718 at every point, so the
 * correction lands later than a turn and something other than those events
 * carries it.
 *
 * This records every change to the window's bounds, its content bounds and the
 * view's bounds for three seconds after a maximize, so the moment it moves is
 * visible rather than inferred. Reports only; removed once read.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp({ "window.restrictMinimumSize": false });

const SAMPLE_WINDOW = 3_000;

test("reports when the content bounds settle after a maximize", async () => {
  test.skip(process.platform !== "win32", "the gap is a Windows frame arithmetic one");

  await meru.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setBounds({ width: 700, height: 500 });
  });

  await expect
    .poll(async () =>
      meru.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBounds().width),
    )
    .toBe(700);

  await meru.app.evaluate(({ BrowserWindow }, sampleWindow) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    const changes: string[] = [];

    (globalThis as unknown as { __changes: string[] }).__changes = changes;

    const started = Date.now();

    let previous = "";

    // Only changes are kept. Three seconds of ten millisecond samples is three
    // hundred rows of mostly the same numbers, and what is wanted is the moment
    // one of them moves.
    const timer = setInterval(() => {
      const bounds = window.getBounds();
      const content = window.getContentBounds();
      const view = window.contentView.children[0]?.getBounds();

      const row = `bounds ${bounds.width}x${bounds.height} content ${content.width}x${content.height} view ${view?.width}x${view?.height}`;

      if (row !== previous) {
        changes.push(`+${Date.now() - started}ms ${row}`);

        previous = row;
      }

      if (Date.now() - started > sampleWindow) {
        clearInterval(timer);
      }
    }, 10);

    // Recorded alongside, so an event that coincides with a change is visible.
    for (const name of ["maximize", "resize", "resized", "unmaximize"]) {
      window.on(name as "resize", () => {
        changes.push(`+${Date.now() - started}ms EVENT ${name}`);
      });
    }

    window.maximize();
  }, SAMPLE_WINDOW);

  await expect
    .poll(
      async () =>
        meru.app.evaluate(
          () => (globalThis as unknown as { __changes: string[] }).__changes.length,
        ),
      { timeout: SAMPLE_WINDOW + 5_000, intervals: [500] },
    )
    .toBeGreaterThan(0);

  // Left to run out, so the whole window is in the recording rather than
  // whatever had happened by the time the poll above was satisfied.
  await expect
    .poll(
      async () =>
        meru.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isMaximized() ? "maximized" : "not",
        ),
      { timeout: SAMPLE_WINDOW + 5_000, intervals: [SAMPLE_WINDOW] },
    )
    .toBe("maximized");

  const changes = await meru.app.evaluate(
    () => (globalThis as unknown as { __changes: string[] }).__changes,
  );

  for (const change of changes) {
    console.log(`[e2e] ${change}`);
  }

  const workArea = await meru.app.evaluate(({ screen, BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    return screen.getDisplayMatching(window?.getBounds() ?? { x: 0, y: 0, width: 0, height: 0 })
      .workArea;
  });

  console.log(`[e2e] work area: ${JSON.stringify(workArea)}`);
});
