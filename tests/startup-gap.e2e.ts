/*
 * TEMPORARY. Two readings taken off a Windows runner, since this is a Linux
 * sandbox and neither is reachable here. Reports only; both assert nothing and
 * the file is removed once the numbers are read.
 *
 * One: how long the main window goes without the `resize` listener that lays the
 * account views out, on a runner where Gmail actually loads over the network.
 *
 * Two: what the window's content bounds read as at each point during a maximize.
 * On Windows the view ends up two pixels short at the bottom, which says the app
 * laid out from a height that was not the final one — this says which reading
 * was stale and whether the settled value is there a turn later.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp();

type Sample = {
  label: string;
  bounds: Electron.Rectangle;
  contentBounds: Electron.Rectangle;
};

test("reports when the window's resize listener is registered", async () => {
  const readState = () =>
    meru.app.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();

      return {
        uptime: process.uptime(),
        listeners: window ? window.listenerCount("resize") : -1,
        views: window ? window.contentView.children.length : -1,
      };
    });

  const first = await readState();

  console.log(`[e2e] first reading: ${JSON.stringify(first)}`);

  await expect
    .poll(async () => (await readState()).listeners, { timeout: 60_000 })
    .toBeGreaterThan(0);

  console.log(`[e2e] listener registered by: ${JSON.stringify(await readState())}`);
});

test("reports what the window's bounds read as through a maximize", async () => {
  await meru.app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    const samples: unknown[] = [];

    (globalThis as unknown as { __samples: unknown[] }).__samples = samples;

    const sample = (label: string) => {
      samples.push({
        label,
        bounds: window.getBounds(),
        contentBounds: window.getContentBounds(),
      });
    };

    window.on("resize", () => {
      sample("resize");

      // A turn later, to see whether the content bounds settle after the event
      // the app acts on has already been and gone.
      setImmediate(() => sample("resize + setImmediate"));
    });

    window.on("maximize", () => {
      sample("maximize");

      setImmediate(() => sample("maximize + setImmediate"));
    });

    window.on("unmaximize", () => {
      sample("unmaximize");

      setImmediate(() => sample("unmaximize + setImmediate"));
    });
  });

  await meru.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setBounds({ width: 960, height: 600 });
  });

  await expect
    .poll(() =>
      meru.app.evaluate(() => (globalThis as unknown as { __samples: unknown[] }).__samples.length),
    )
    .toBeGreaterThan(0);

  await meru.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize();
  });

  // Tolerated rather than asserted: xvfb has no window manager, so a Linux run
  // never maximizes and this probe still has samples worth printing.
  await expect
    .poll(
      async () =>
        meru.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMaximized()),
      { timeout: 5_000 },
    )
    .toBe(true)
    .catch(() => undefined);

  await meru.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.unmaximize();
  });

  const samples = await meru.app.evaluate(
    () => (globalThis as unknown as { __samples: Sample[] }).__samples,
  );

  for (const sample of samples) {
    console.log(`[e2e] ${sample.label}: ${JSON.stringify(sample)}`);
  }

  const settled = await meru.app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    return {
      bounds: window?.getBounds(),
      contentBounds: window?.getContentBounds(),
      views: window?.contentView.children.map((child) => child.getBounds()),
    };
  });

  console.log(`[e2e] settled: ${JSON.stringify(settled)}`);
});
