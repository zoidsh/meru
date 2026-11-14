import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { test as base, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

import { E2E_GLOBAL, e2eSnapshotSchema } from "../app/main/shell/e2e.ts";
import { profiles } from "../app/shared/channels/profiles.ts";
import { settings } from "../app/shared/channels/settings.ts";
import { stage } from "../app/shared/channels/stage.ts";
import type { CommandId } from "../app/shared/commands/registry.ts";
import {
  invokeIn,
  launch as launchApp,
  pageOf,
  pagesOf,
  readExposed,
  valueOf,
} from "../scripts/lib/app.ts";
import type { Launched, LaunchOptions } from "../scripts/lib/app.ts";
import { startStub } from "./entitlement-stub.ts";
import type { Stub } from "./entitlement-stub.ts";
import { startFeedStub } from "./feed-stub.ts";
import type { FeedStub } from "./feed-stub.ts";

export { expect };

/** The suite's test, whose fixtures tear down what they started however the test ends. */
export const test = base.extend<{
  /** A temporary user data directory, removed after the test, which every launch in the test shares. */
  userData: string;
  /** Launches the app over `userData`; whatever is still open when the test ends is closed. */
  launch: (options?: Omit<LaunchOptions, "userData">) => Promise<Launched>;
  /** The entitlement API's stand-in, answering a trial to a device with no license key. */
  stub: Stub;
  /** Gmail's inbox feed's stand-in, answering an empty inbox. */
  feed: FeedStub;
}>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from the destructuring of its first parameter
  feed: async ({}, provide) => {
    const feed = await startFeedStub();
    await provide(feed);
    await feed.stop();
  },
  launch: async ({ userData }, provide) => {
    const open = new Set<Launched>();
    await provide(async (options = {}) => {
      const launched = await launchApp({ ...options, userData });
      const tracked: Launched = {
        ...launched,
        close: async () => {
          open.delete(tracked);
          await launched.close();
        },
      };
      open.add(tracked);
      return tracked;
    });
    await Promise.all(
      [...open].map(async (left) => {
        await left.close();
      })
    );
  },
  // oxlint-disable-next-line no-empty-pattern -- as above
  stub: async ({}, provide) => {
    const stub = await startStub();
    await provide(stub);
    stub.release();
    await stub.stop();
  },
  // oxlint-disable-next-line no-empty-pattern -- as above
  userData: async ({}, provide) => {
    const userData = await mkdtemp(path.join(tmpdir(), "meru-e2e-"));
    await provide(userData);
    await rm(userData, { force: true, recursive: true });
  },
});

/** The value, or a failure naming what is missing, so an assertion never runs on a stand-in. */
export const must = <T>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) {
    throw new Error(`${what} is missing`);
  }
  return value;
};

/** What Electron holds for the page's stage and the menu: the bounds of each child view, bottom first, each pane's tab, web contents and zoom, and each command's accelerator. */
export const inspect = async (app: ElectronApplication) =>
  e2eSnapshotSchema.parse(await readExposed(app, E2E_GLOBAL));

export const viewsOf = async (app: ElectronApplication) => {
  const { views } = await inspect(app);
  return views;
};

/** Each pane's tab with the id of the web contents showing it and its zoom, in layout order. */
export const panesOf = async (app: ElectronApplication) => {
  const { panes } = await inspect(app);
  return panes;
};

export const zoomOf = async (app: ElectronApplication) => {
  const panes = await panesOf(app);
  return panes.map((pane) => pane.zoom);
};

export const stageOf = async (chrome: Page) =>
  valueOf(await invokeIn(chrome, stage.snapshot, {}));

export const profilesOf = async (chrome: Page) =>
  valueOf(await invokeIn(chrome, profiles.snapshot, {}));

export const entitlementOf = async (app: ElectronApplication) => {
  const { entitlement } = await inspect(app);
  return entitlement;
};

export const entitlementKindOf = async (app: ElectronApplication) => {
  const { kind } = await entitlementOf(app);
  return kind;
};

export const updateOf = async (app: ElectronApplication) => {
  const { update } = await inspect(app);
  return update;
};

export const settingsOf = async (chrome: Page) =>
  valueOf(await invokeIn(chrome, settings.snapshot, {}));

export const styleOf = async (chrome: Page) => {
  const { style } = await stageOf(chrome);
  return style;
};

export const clickMenuItem = async (
  app: ElectronApplication,
  id: CommandId
) => {
  await app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
    if (!item) {
      throw new Error(`No menu item ${itemId}`);
    }
    // MenuItem.click is typed as a bare Function.
    Reflect.apply(item.click, item, []);
  }, id);
};

const LAUNCHER = "kind=launcher";

/** The launcher's page once it is open. */
export const launcherOf = async (app: ElectronApplication) =>
  await pageOf(app, LAUNCHER);

/** Whether the launcher's page is open. */
export const launcherOpen = (app: ElectronApplication) =>
  pagesOf(app, LAUNCHER).length > 0;

/** Picks the app named `name` with Enter in the open launcher, and waits for it to close. */
export const pickApp = async (app: ElectronApplication, name: string) => {
  const launcher = await launcherOf(app);
  const search = launcher.locator("input");
  await search.fill(name);
  await expect(launcher.locator("[data-app-id]")).toHaveCount(1);
  // Enter closes the launcher's page, which can be gone before Playwright hears back about the key, so the press may fail once it has done its work; the poll below is the assertion.
  await search.press("Enter").catch(() => null);
  await expect.poll(() => launcherOpen(app)).toBeFalsy();
};

/** The settings window's page once it is open. */
export const settingsPageOf = async (app: ElectronApplication) =>
  await pageOf(app, "/settings.html");

/** Types a key into the page whose URL contains `part` as the operating system would, through its web contents, so a key the page leaves alone goes on to the menu. */
export const pressIn = async (
  app: ElectronApplication,
  part: string,
  keyCode: string,
  modifiers: readonly ("alt" | "control" | "meta" | "shift")[] = []
) => {
  await app.evaluate(
    ({ webContents }, key) => {
      const contents = webContents
        .getAllWebContents()
        .find((found) => found.getURL().includes(key.part));
      if (contents === undefined) {
        throw new Error(`No page at ${key.part}`);
      }
      const event = { keyCode: key.keyCode, modifiers: [...key.modifiers] };
      contents.sendInputEvent({ ...event, type: "keyDown" });
      contents.sendInputEvent({ ...event, type: "keyUp" });
    },
    { keyCode, modifiers, part }
  );
};
