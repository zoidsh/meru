// Linux needs a display: `xvfb-run -a pnpm test:e2e` where there is none.
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { _electron, expect, test as base } from "@playwright/test";
import type { ElectronApplication, Page, TestInfo } from "@playwright/test";
import { delay, withTimeout } from "es-toolkit";

import { DEV_IDENTITY } from "#core/app-identity.ts";
import { REFUSED_MARKER } from "#core/loopback.ts";

import { startStandIn } from "./stand-in.ts";
import type { StandIn } from "./stand-in.ts";
import { shootWindow } from "./window-shot.ts";

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

const saveTrace = async (app: ElectronApplication, testInfo: TestInfo) => {
  const tracePath = testInfo.outputPath("trace.zip");

  try {
    await app.context().tracing.stop({ path: tracePath });
    await testInfo.attach("trace", {
      path: tracePath,
      contentType: "application/zip",
    });
  } catch (error) {
    // An app that died mid-test has nothing left to record.
    console.warn(`Kept no trace: ${String(error)}`);
  }
};

/**
 * Runs `save`, warning rather than failing where the app has nothing left
 * to give, and giving up after a few seconds, so a hung main or renderer
 * cannot hold the teardown that closes and kills it.
 */
const keep = async (what: string, save: () => Promise<unknown>) => {
  try {
    await withTimeout(save, 5000);
  } catch (error) {
    console.warn(`Kept no ${what}: ${String(error)}`);
  }
};

/**
 * What a failed test's app showed: the whole window drawn as a person sees
 * it, each view over the shell, and the accessibility tree of the shell and
 * of the overlay's document, which holds the toast, the menus and the
 * cards; Playwright's own report has the shell's tree alone. `name` tells
 * a test's second app from its first.
 */
const saveFailure = async (
  app: ElectronApplication,
  testInfo: TestInfo,
  name: string
) => {
  const pages = app.windows().filter((page) => !page.isClosed());
  const shell = pages.find((page) => page.url().startsWith("meru-app:"));
  const names = await Promise.all(
    pages.map((page) =>
      page.url() === "about:blank"
        ? withTimeout(() => page.evaluate(() => window.name), 5000).catch(
            () => ""
          )
        : ""
    )
  );
  const overlay = pages[names.indexOf("meru-overlay")];
  const attach = async (label: string, file: string, contentType: string) => {
    await testInfo.attach(`${name} ${label}`, {
      path: testInfo.outputPath(`${name}-${file}`),
      contentType,
    });
  };

  if (shell) {
    await keep("window picture", async () => {
      await shootWindow(app, shell, testInfo.outputPath(`${name}-window.png`));
      await attach("window", "window.png", "image/png");
    });
  }

  for (const [label, page] of [
    ["shell", shell],
    ["overlay", overlay],
  ] as const) {
    if (page) {
      // oxlint-disable-next-line no-await-in-loop -- one file after the other
      await keep(`${label} tree`, async () => {
        await writeFile(
          testInfo.outputPath(`${name}-${label}-aria.yml`),
          await page.ariaSnapshot()
        );
        await attach(`${label} tree`, `${label}-aria.yml`, "text/yaml");
      });
    }
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
 * The overlay's blank document, which the shell opened under its name and
 * draws into. A page's own blank windows have no such name.
 */
export const findOverlayDocument = async (app: ElectronApplication) => {
  const find = async () => {
    const blank = app
      .windows()
      .filter((page) => !page.isClosed() && page.url() === "about:blank");
    const names = await Promise.all(
      blank.map((page) => page.evaluate(() => window.name).catch(() => ""))
    );

    return blank[names.indexOf("meru-overlay")];
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

/** The application menu's item's label, and whether it is enabled and checked. */
export const readMenuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);

    return {
      label: item?.label,
      enabled: item?.enabled,
      checked: item?.checked,
    };
  }, id);

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

/**
 * Gives the window `width` by `height` of content and waits for its views
 * to follow. A test whose panes need room sets it, since the default size
 * does not fit a hosted Windows runner's 1024 by 768 desktop and the
 * window there comes out smaller; it fits that desktop.
 */
export const sizeWindow = async (
  app: ElectronApplication,
  width: number,
  height: number
) => {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height);
    },
    { width, height }
  );
  await expect
    .poll(() => readViews(app).then(({ area }) => area))
    .toStrictEqual({ width, height });
};

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
  /**
   * Launches the app on the test's user data, with `env` added to its
   * environment; closed when the test ends.
   */
  launchApp: (env?: Record<string, string>) => Promise<ElectronApplication>;
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
  launchApp: async ({ userDataDir, launched, standIn }, use, testInfo) => {
    const apps: ElectronApplication[] = [];
    // Every request the app's build refused for leaving this machine.
    const refused: string[] = [];

    try {
      await use(async (added = {}) => {
        const app = await _electron.launch({
          executablePath,
          args: launchArgs(userDataDir),
          env: { ...env, ...added, MERU_TEST_APP_URLS: standIn.appUrls },
        });

        app.process().stderr?.on("data", (chunk: Buffer) => {
          for (const line of String(chunk).split("\n")) {
            if (line.startsWith(REFUSED_MARKER)) {
              refused.push(line.slice(REFUSED_MARKER.length + 1));
            }
          }
        });

        const { pid } = app.process();

        if (pid !== undefined) {
          launched.push(pid);
        }

        apps.push(app);

        return app;
      });
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        for (const [index, app] of apps.entries()) {
          // oxlint-disable-next-line no-await-in-loop -- one app's pictures at a time
          await saveFailure(app, testInfo, `app-${index + 1}`);
        }
      }

      // A close that hangs, as on a blocking dialog, is not waited out: the
      // user data directory's teardown kills whatever is left.
      await Promise.all(
        apps.map((app) =>
          withTimeout(() => app.close(), 10_000).catch(() => false)
        )
      );
    }

    // After the closes, so a request made while closing counts too.
    if (refused.length > 0) {
      throw new Error(
        `The app asked to reach the network, which the suite's build refused: ${[...new Set(refused)].join(", ")}`
      );
    }
  },
  app: async ({ launchApp }, use, testInfo) => {
    const app = await launchApp();

    await app.context().tracing.start({ screenshots: true, snapshots: true });
    await use(app);

    if (testInfo.status !== testInfo.expectedStatus) {
      await saveTrace(app, testInfo);
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
