import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { _electron as electron, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

import { wireName } from "../packages/app/shared/channels/define.ts";
import { e2e } from "../packages/app/shared/channels/stage.ts";

const root = path.join(import.meta.dirname, "..");

export interface Launched {
  readonly app: ElectronApplication;
  readonly userData: string;
  readonly chrome: Page;
  readonly close: () => Promise<void>;
}

export interface LaunchOptions {
  readonly env?: Readonly<Record<string, string>>;
  /** The settings layers, written to `settings.json` before the app starts. */
  readonly settings?: unknown;
}

export const SETTINGS_FILE = "settings.json";

export const writeSettings = async (userData: string, settings: unknown) => {
  await writeFile(
    path.join(userData, SETTINGS_FILE),
    JSON.stringify({ data: settings, version: 1 })
  );
};

export const launch = async ({
  env = {},
  settings,
}: LaunchOptions = {}): Promise<Launched> => {
  const userData = await mkdtemp(path.join(tmpdir(), "meru-e2e-"));
  if (settings !== undefined) {
    await writeSettings(userData, settings);
  }
  // chrome-sandbox ships without its setuid bit outside an installed package, so an unpacked Linux run cannot use the sandbox.
  const sandbox = process.platform === "linux" ? ["--no-sandbox"] : [];
  const app = await electron.launch({
    args: [root, `--user-data-dir=${userData}`, ...sandbox],
    env: {
      ...process.env,
      MERU_BACKGROUND: "1",
      MERU_E2E: "1",
      MERU_TEST_BACKGROUND: "1",
      ...env,
    },
  });
  // Every pane is a page to Playwright as well, so the chrome page is told apart by its URL.
  await expect
    .poll(() =>
      app.windows().some((page) => page.url().endsWith("chrome.html"))
    )
    .toBeTruthy();
  const chrome = app
    .windows()
    .find((page) => page.url().endsWith("chrome.html"));
  if (chrome === undefined) {
    throw new Error("The chrome page went away");
  }
  return {
    app,
    chrome,
    userData,
    close: async () => {
      await app.close();
      await rm(userData, { force: true, recursive: true });
    },
  };
};

const answerSchema = e2e.snapshot.result;

/** The stage as main holds it and the bounds Electron reports for each child view, bottom first. */
export const stageOf = async (chrome: Page) => {
  const answer = await chrome.evaluate<unknown>(
    `window.meru.invoke(${JSON.stringify(wireName(e2e.snapshot))}, {})`
  );
  const result = answerSchema.safeParse(
    typeof answer === "object" && answer !== null && "value" in answer
      ? answer.value
      : answer
  );
  if (!result.success) {
    throw new Error(
      `The stage snapshot did not parse: ${JSON.stringify(answer)}`
    );
  }
  return result.data;
};

export const viewsOf = async (chrome: Page) => {
  const { views } = await stageOf(chrome);
  return views;
};

export const styleOf = async (chrome: Page) => {
  const { stage } = await stageOf(chrome);
  return stage.style;
};

export const clickMenuItem = async (app: ElectronApplication, id: string) => {
  await app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
    if (!item) {
      throw new Error(`No menu item ${itemId}`);
    }
    // MenuItem.click is typed as a bare Function.
    Reflect.apply(item.click, item, []);
  }, id);
};
