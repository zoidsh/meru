import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { _electron as electron, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import type { z } from "zod";

import { BRIDGE_KEY } from "../../app/core/ports.ts";
import type { ProfilesState } from "../../app/core/records/profiles-state.ts";
import type { Result } from "../../app/core/result.ts";
import { commands } from "../../app/shared/channels/commands.ts";
import { settle, wireName } from "../../app/shared/channels/define.ts";
import type {
  EventChannel,
  IpcError,
  InvokeChannel,
  SyncChannel,
} from "../../app/shared/channels/define.ts";
import type { CommandId } from "../../app/shared/commands/registry.ts";
import type { Settings } from "../../app/shared/settings/registry.ts";

const root = path.join(import.meta.dirname, "..", "..");

export interface Launched {
  readonly app: ElectronApplication;
  readonly userData: string;
  readonly chrome: Page;
  readonly close: () => Promise<void>;
}

export interface LaunchOptions {
  readonly env?: Readonly<Record<string, string>>;
  /** The settings layers, written to `settings.json` before the app starts. */
  readonly settings?: Settings;
  /** The id of the one profile, written to `profiles.json` before the app starts, for a test that names the profile in a file. */
  readonly profileId?: string;
  /** An existing user data directory, kept when the app closes; a temporary one otherwise. */
  readonly userData?: string;
}

export const SETTINGS_FILE = "settings.json";

export const writeSettings = async (userData: string, settings: Settings) => {
  await writeFile(
    path.join(userData, SETTINGS_FILE),
    JSON.stringify({ data: settings, version: 1 })
  );
};

/** What a first launch writes to `profiles.json`, with the profile's id chosen. */
export const firstProfiles = (profileId: string): ProfilesState => ({
  groups: [
    {
      id: "group-1",
      layout: { kind: "leaf", paneId: "pane-1", tabIds: ["tab-1"] },
      profileId,
      tabIds: ["tab-1"],
    },
  ],
  profiles: [
    { id: profileId, label: "Personal", order: 0, status: { kind: "ok" } },
  ],
  selectedProfileId: profileId,
  tabs: [
    {
      appId: "gmail",
      health: "ok",
      id: "tab-1",
      profileId,
      sleeping: false,
      title: "Gmail",
      url: "https://mail.google.com/",
      zoom: 1,
    },
  ],
});

const isChromePage = (page: Page) =>
  new URL(page.url()).pathname.endsWith("/chrome.html");

export const launch = async ({
  env = {},
  settings,
  profileId,
  userData: given,
}: LaunchOptions = {}): Promise<Launched> => {
  const userData = given ?? (await mkdtemp(path.join(tmpdir(), "meru-e2e-")));
  if (settings !== undefined) {
    await writeSettings(userData, settings);
  }
  if (profileId !== undefined) {
    await writeFile(
      path.join(userData, "profiles.json"),
      JSON.stringify({ data: firstProfiles(profileId), version: 1 })
    );
  }
  // chrome-sandbox ships without its setuid bit outside an installed package, so an unpacked Linux run cannot use the sandbox.
  const sandbox = process.platform === "linux" ? ["--no-sandbox"] : [];
  const app = await electron.launch({
    args: [path.join(root, "app"), `--user-data-dir=${userData}`, ...sandbox],
    env: {
      ...process.env,
      MERU_BACKGROUND: "1",
      MERU_E2E: "1",
      MERU_TEST_BACKGROUND: "1",
      ...env,
    },
  });
  // Every pane is a page to Playwright as well, so the chrome page is told apart by its URL.
  await expect.poll(() => app.windows().some(isChromePage)).toBeTruthy();
  const chrome = app.windows().find(isChromePage);
  if (chrome === undefined) {
    throw new Error("The chrome page went away");
  }
  return {
    app,
    chrome,
    userData,
    close: async () => {
      await app.close();
      if (given === undefined) {
        await rm(userData, { force: true, recursive: true });
      }
    },
  };
};

/** Calls what main left under `key` on globalThis for a test or a measurement, a function answering JSON, and parses its answer. */
export const readExposed = async (
  app: ElectronApplication,
  key: string
): Promise<unknown> => {
  const json = await app.evaluate((_electron, name) => {
    const read: unknown = Reflect.get(globalThis, name);
    if (typeof read !== "function") {
      throw new TypeError(`Main exposes nothing under ${name}`);
    }
    const answer: unknown = Reflect.apply(read, undefined, []);
    if (typeof answer !== "string") {
      throw new TypeError(`${name} answered no JSON`);
    }
    return answer;
  }, key);
  const parsed: unknown = JSON.parse(json);
  return parsed;
};

/** Sends a request as the page's client would, and settles main's answer the same way. */
export const invokeIn = async <P extends z.ZodType, R extends z.ZodType>(
  page: Page,
  channel: InvokeChannel<P, R> | SyncChannel<P, R>,
  payload: z.input<P>
): Promise<Result<z.output<R>, IpcError>> => {
  const method = channel.kind === "invoke" ? "invoke" : "sendSync";
  const answer = await page.evaluate<unknown>(
    `window.${BRIDGE_KEY}.${method}(${JSON.stringify(wireName(channel))}, ${JSON.stringify(payload)})`
  );
  return settle(channel.result, answer);
};

/** Sends an event as the page's client would. */
export const sendIn = async <P extends z.ZodType>(
  page: Page,
  channel: EventChannel<P>,
  payload: z.input<P>
): Promise<void> => {
  await page.evaluate(
    `window.${BRIDGE_KEY}.send(${JSON.stringify(wireName(channel))}, ${JSON.stringify(payload)})`
  );
};

/** Runs a command as a button on the chrome page would, and answers what main answered. */
export const runCommand = async (chrome: Page, id: CommandId) =>
  await invokeIn(chrome, commands.run, { id });
