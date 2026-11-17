// Linux needs a display: `xvfb-run -a pnpm test:e2e` where there is none.
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { _electron, expect, test as base } from "@playwright/test";
import type {
  ElectronApplication,
  Locator,
  Page,
  TestInfo,
} from "@playwright/test";
import { delay, withTimeout } from "es-toolkit";

import { DEV_IDENTITY } from "#core/app-identity.ts";

import { startStandIn } from "./stand-in.ts";
import type { StandIn } from "./stand-in.ts";

const run = promisify(execFile);

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

const { productName } = DEV_IDENTITY;

const unpackedExecutable = () => {
  const arm = process.arch === "arm64";

  switch (process.platform) {
    case "darwin": {
      return [
        arm ? "mac-arm64" : "mac",
        `${productName}.app`,
        "Contents",
        "MacOS",
        productName,
      ];
    }
    case "win32": {
      return [
        arm ? "win-arm64-unpacked" : "win-unpacked",
        `${productName}.exe`,
      ];
    }
    default: {
      // electron-builder names the Linux executable after the package.
      return [arm ? "linux-arm64-unpacked" : "linux-unpacked", "meru"];
    }
  }
};

const executablePath = path.join(
  repositoryRoot,
  "dist",
  "e2e",
  ...unpackedExecutable()
);

/** Only the e2e build honours `MERU_TEST_BACKGROUND`. */
const env = { ...process.env, MERU_TEST_BACKGROUND: "1" } as Record<
  string,
  string
>;

const launchArgs = (userDataDir: string) => [
  `--user-data-dir=${userDataDir}`,
  // An unpacked Linux build's chrome-sandbox lacks its setuid bit.
  ...(process.platform === "linux" ? ["--no-sandbox"] : []),
];

/**
 * Every process of an app carries its user data directory on its command
 * line, the helpers and the crash handler too, so the directory finds them
 * all, even after the main process has died.
 */
const killUnix = async (userDataDir: string, giveUpAt: number) => {
  const { stdout } = await run("ps", ["-A", "-ww", "-o", "pid=,args="], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const left = stdout
    .split("\n")
    .filter((line) => line.includes(userDataDir))
    .map((line) => Number(line.trim().split(" ", 1)[0]));

  if (left.length === 0) {
    return;
  }

  if (Date.now() > giveUpAt) {
    throw new Error(`Processes ${left.join(", ")} outlived the test`);
  }

  for (const pid of left) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Gone in the meantime.
    }
  }

  await delay(100);
  await killUnix(userDataDir, giveUpAt);
};

/** On Windows the tree under each launched pid is killed. */
const killAll = async (userDataDir: string, pids: number[]) => {
  if (process.platform !== "win32") {
    await killUnix(userDataDir, Date.now() + 15_000);

    return;
  }

  await Promise.all(
    pids.map((pid) =>
      run("taskkill", ["/T", "/F", "/PID", String(pid)]).catch(() => false)
    )
  );
};

const saveFailure = async (app: ElectronApplication, testInfo: TestInfo) => {
  const tracePath = testInfo.outputPath("trace.zip");

  try {
    await app.context().tracing.stop({ path: tracePath });
    await testInfo.attach("trace", {
      path: tracePath,
      contentType: "application/zip",
    });
    await Promise.all(
      app
        .windows()
        .filter((window) => !window.isClosed())
        .map(async (window, index) => {
          const shotPath = testInfo.outputPath(`window-${index + 1}.png`);

          // The overlay's page has no size while it is closed.
          if ((await window.evaluate(() => innerWidth * innerHeight)) === 0) {
            return;
          }

          await window.screenshot({ path: shotPath });
          await testInfo.attach(`window ${index + 1}`, {
            path: shotPath,
            contentType: "image/png",
          });
        })
    );
  } catch (error) {
    // An app that died mid-test has nothing left to record.
    console.warn(`Kept no trace or screenshot: ${String(error)}`);
  }
};

/** The first of the app's pages whose URL starts with `prefix`, once loaded. */
export const findPage = async (app: ElectronApplication, prefix: string) => {
  const find = () =>
    app.windows().find((page) => page.url().startsWith(prefix));

  await expect.poll(() => find() !== undefined).toBe(true);

  const page = find() as Page;

  await page.waitForLoadState("load");

  return page;
};

/**
 * A blank document the shell opened under `name` and draws into: the
 * overlay's, or the tooltips'. A page's own blank windows have no such name.
 */
export const findShellDocument = async (
  app: ElectronApplication,
  name: "meru-overlay" | "meru-tooltip"
) => {
  const find = async () => {
    const blank = app
      .windows()
      .filter((page) => !page.isClosed() && page.url() === "about:blank");
    const names = await Promise.all(
      blank.map((page) => page.evaluate(() => window.name).catch(() => ""))
    );

    return blank[names.indexOf(name)];
  };
  let found: Page | undefined;

  await expect
    .poll(async () => {
      found = await find();

      return found !== undefined;
    })
    .toBe(true);

  return found as Page;
};

/**
 * The view the shell's tooltips are drawn in: whether it shows, where, and
 * whether it is above every other view of the window.
 */
export const readTooltipView = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().startsWith("meru-app:")
    );
    const children = window?.contentView.children ?? [];
    // A crashed page's frame throws when read.
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in main, which sees nothing outside
    const nameOf = (view: Electron.View) => {
      try {
        return (view as Electron.WebContentsView).webContents?.mainFrame.name;
      } catch {
        return "";
      }
    };
    const index = children.findIndex((view) => nameOf(view) === "meru-tooltip");
    const view = children[index];

    return {
      visible: view?.getVisible() ?? false,
      bounds: view?.getBounds(),
      onTop: index !== -1 && index === children.length - 1,
    };
  });

/**
 * Opens `trigger`'s tooltip by the pointer coming onto its centre from away,
 * so it enters even when the pointer is already there after a click.
 */
export const pointAt = async (trigger: Locator) => {
  const { mouse } = trigger.page();

  await expect(trigger).toBeVisible();
  await mouse.move(1, 1);

  const box = await trigger.boundingBox();

  if (!box) {
    throw new Error("The tooltip's trigger has no box to point at");
  }

  await mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 4,
  });
};

/**
 * Waits until a tooltip saying `text` shows above the page: drawn in the
 * tooltips' document, with its view shown and on top.
 */
export const expectTooltip = async (app: ElectronApplication, text: string) => {
  const tooltips = await findShellDocument(app, "meru-tooltip");

  await expect(tooltips.getByText(text)).toBeVisible();
  await expect
    .poll(async () => {
      const { visible, onTop } = await readTooltipView(app);

      return visible && onTop;
    })
    .toBe(true);
};

/**
 * The shell window's root view and content size, whether its menu bar shows,
 * and each content view: its page, its session's partition, where it sits and
 * whether it shows. The overlay's view, which the shell opened, is left out.
 */
export const readViews = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().startsWith("meru-app:")
    );

    if (!window) {
      throw new Error("The app has no shell window");
    }

    const { width, height } = window.contentView.getBounds();
    const [contentWidth = 0, contentHeight = 0] = window.getContentSize();

    return {
      area: { width, height },
      content: { width: contentWidth, height: contentHeight },
      menuBarVisible: window.isMenuBarVisible(),
      views: window.contentView.children
        .map((view) => view as Electron.WebContentsView)
        .filter(
          (view) => view.webContents.opener !== window.webContents.mainFrame
        )
        .map((view) => ({
          url: view.webContents.getURL(),
          // A persistent partition's folder is named after it.
          partition: `persist:${view.webContents.session.storagePath?.split(/[/\\]/u).at(-1) ?? ""}`,
          bounds: view.getBounds(),
          visible: view.getVisible(),
        })),
    };
  });

/** The URL and session of each view that shows. */
export const shownViews = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views
    .filter((view) => view.visible)
    .map(({ url, partition }) => ({ url, partition }));
};

/** Records what would open in the system browser, opening nothing. */
export const stubSystemBrowser = (app: ElectronApplication) =>
  app.evaluate(({ shell }) => {
    const opened: string[] = [];

    Reflect.set(globalThis, "openedExternally", opened);
    shell.openExternal = (url) => {
      opened.push(url);

      return Promise.resolve();
    };
  });

export const readOpenedExternally = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "openedExternally") as string[]);

/**
 * Clicks the application menu's item, as a person choosing it would with
 * focus in the page at `focusedUrl`. The suite's app is never the active app,
 * so the system says of no page that it has focus.
 */
export const clickMenuItem = (
  app: ElectronApplication,
  id: string,
  focusedUrl?: string
) =>
  app.evaluate(
    ({ Menu, BrowserWindow, webContents }, { itemId, url }) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);

      if (!item) {
        throw new Error(`The application menu has no ${itemId}`);
      }

      const focused =
        url === undefined
          ? undefined
          : webContents
              .getAllWebContents()
              .find((candidate) => candidate.getURL().startsWith(url));

      item.click(undefined, BrowserWindow.getAllWindows()[0], focused);
    },
    { itemId: id, url: focusedUrl }
  );

/** The label of the application menu's item, as it is now. */
export const readMenuLabel = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, itemId) =>
      Menu.getApplicationMenu()?.getMenuItemById(itemId)?.label,
    id
  );

/**
 * The unread mail across profiles, as the badge would count it: what a test
 * with one profile, whose titlebar has no profile row, waits on.
 */
export const readUnreadTotal = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (
        Reflect.get(globalThis, "meruTestBadge") as
          | { count: number }
          | undefined
      )?.count ?? 0
  );

/** What Gmail's tab would do as mail comes: change its title, a poke. */
export const retitle = (page: Page, title: string) =>
  page.evaluate((next) => {
    document.title = next;
  }, title);

/** Seeds `state.json` before a launch; the store's current version is 1. */
export const writeState = (userDataDir: string, state: object) =>
  writeFile(
    path.join(userDataDir, "state.json"),
    JSON.stringify({ version: 1, ...state })
  );

/** Seeds `settings.json` before a launch; the store's current version is 1. */
export const writeSettings = (userDataDir: string, settings: object) =>
  writeFile(
    path.join(userDataDir, "settings.json"),
    JSON.stringify({ version: 1, ...settings })
  );

/** `state.json` as the app left it, read as whatever the test asserts on. */
export const readState = async <State>(userDataDir: string) =>
  JSON.parse(
    await readFile(path.join(userDataDir, "state.json"), "utf-8")
  ) as State;

interface AppFixtures {
  /** The pids this test launched, for the teardown on Windows. */
  launched: number[];
  userDataDir: string;
  /** Served in place of Gmail to every app the test launches. */
  standIn: StandIn;
  /** Launches the app on the test's user data; closed when the test ends. */
  launchApp: () => Promise<ElectronApplication>;
  app: ElectronApplication;
  /** The shell window, once it has loaded. */
  shell: Page;
  /** Starts a second instance on the test's user data, outside Playwright. */
  spawnApp: () => { exited: Promise<number | null> };
}

export const test = base.extend<AppFixtures>({
  launched: async ({}, use) => {
    await use([]);
  },
  userDataDir: async ({ launched }, use) => {
    const dir = await mkdtemp(path.join(tmpdir(), "meru4-e2e-"));

    try {
      await use(dir);
    } finally {
      await killAll(dir, launched);
      // Windows can hold a file a moment after its process has gone.
      await rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  },
  standIn: async ({}, use) => {
    const standIn = await startStandIn();

    try {
      await use(standIn);
    } finally {
      await standIn.close();
    }
  },
  launchApp: async ({ userDataDir, launched, standIn }, use) => {
    const apps: ElectronApplication[] = [];

    try {
      await use(async () => {
        const app = await _electron.launch({
          executablePath,
          args: launchArgs(userDataDir),
          env: { ...env, MERU_TEST_APP_URLS: standIn.appUrls },
        });
        const { pid } = app.process();

        if (pid !== undefined) {
          launched.push(pid);
        }

        apps.push(app);

        return app;
      });
    } finally {
      // A close that hangs, as on a blocking dialog, is not waited out: the
      // user data directory's teardown kills whatever is left.
      await Promise.all(
        apps.map((app) =>
          withTimeout(() => app.close(), 10_000).catch(() => false)
        )
      );
    }
  },
  app: async ({ launchApp }, use, testInfo) => {
    const app = await launchApp();

    await app.context().tracing.start({ screenshots: true, snapshots: true });
    await use(app);

    if (testInfo.status !== testInfo.expectedStatus) {
      await saveFailure(app, testInfo);
    }
  },
  shell: async ({ app }, use) => {
    await use(await findPage(app, "meru-app:"));
  },
  spawnApp: async ({ userDataDir, launched, standIn }, use) => {
    await use(() => {
      const child = spawn(executablePath, launchArgs(userDataDir), {
        env: { ...env, MERU_TEST_APP_URLS: standIn.appUrls },
        stdio: "ignore",
      });

      if (child.pid !== undefined) {
        launched.push(child.pid);
      }

      return { exited: once(child, "exit").then(() => child.exitCode) };
    });
  },
});

export { expect } from "@playwright/test";
