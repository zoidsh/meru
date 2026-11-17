import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { APPS } from "#core/apps.ts";
import { STATE_VERSION, gmailTab } from "#core/state.ts";

import { outDir, repositoryRoot } from "../lib/bundles.ts";
import { spawnElectron } from "../lib/launch.ts";
import type { Inspector } from "./inspector.ts";
import { pollUntil } from "./poll.ts";

export const SCENARIOS = ["gmail", "gmail-calendar", "two-profiles"] as const;

export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_DESCRIPTIONS: Record<Scenario, string> = {
  gmail: "one profile, Gmail only",
  "gmail-calendar":
    "one profile, Gmail and Calendar, Calendar opened once and Gmail selected again",
  "two-profiles":
    "two profiles each with Gmail, the second not selected and never opened",
};

export interface Target {
  name: string;
  /** Why the target cannot run a scenario; absent when it runs them all. */
  cannotRun?: (scenario: Scenario) => string | undefined;
  /** Sets the user data directory up for the scenario before a launch. */
  prepare: (scenario: Scenario) => Promise<void>;
  /** Starts the target behind whatever is in front, with stderr piped. */
  launch: () => ChildProcess;
  /** Whether it opens main's inspector, which times the inbox and names renderers. */
  hasInspector: boolean;
  /** Anything the scenario does once the inbox is usable, through main. */
  afterUsable?: (inspector: Inspector, scenario: Scenario) => Promise<void>;
  electronVersion: string;
  /** Bytes on disk, for a packaged app. */
  appBytes?: number;
}

const STDIO = ["ignore", "ignore", "pipe"] as const;
const BACKGROUND = { MERU_BACKGROUND: "1" };

const electronVersion = () =>
  (
    JSON.parse(
      readFileSync(
        path.join(repositoryRoot, "node_modules", "electron", "package.json"),
        "utf-8"
      )
    ) as { version: string }
  ).version;

const profileDir = (name: string) => path.join(repositoryRoot, ".meru", name);

/** The first profile in a copied v4 user data directory that has a session on disk. */
export const signedInProfileId = (userDataDir: string) => {
  const state = JSON.parse(
    readFileSync(path.join(userDataDir, "state.json"), "utf-8")
  ) as { profiles?: { id?: unknown }[] };
  const id = state.profiles
    ?.map((profile) => profile.id)
    .find(
      (candidate): candidate is string =>
        typeof candidate === "string" &&
        existsSync(
          path.join(userDataDir, "Partitions", candidate.toLowerCase())
        )
    );

  if (!id) {
    throw new Error(`No profile in ${userDataDir} has a session on disk.`);
  }

  return id;
};

const CALENDAR_TAB_ID = "measure-calendar";
const SECOND_PROFILE_ID = "measure-second";
const calendarHome = APPS.find((app) => app.id === "calendar")?.home ?? "";

/** v4's state file for a scenario, around the signed-in profile. */
export const v4StateFor = (scenario: Scenario, profileId: string) => {
  const first = {
    id: profileId,
    name: "Default",
    tabs:
      scenario === "gmail-calendar"
        ? [
            gmailTab(),
            {
              id: CALENDAR_TAB_ID,
              app: "calendar",
              url: calendarHome,
              title: "",
            },
          ]
        : [gmailTab()],
    selectedTabId: gmailTab().id,
  };
  const second = {
    id: SECOND_PROFILE_ID,
    name: "Second",
    tabs: [gmailTab()],
    selectedTabId: gmailTab().id,
  };

  return {
    version: STATE_VERSION,
    profiles: scenario === "two-profiles" ? [first, second] : [first],
    selectedProfileId: profileId,
  };
};

/** Opens Calendar from the shell, waits for its page, and goes back to Gmail. */
const visitCalendar = async (inspector: Inspector, profileId: string) => {
  const select = (tabId: string) =>
    inspector.evaluate(`(async () => {
      const { webContents } = require("electron");
      const shell = webContents.getAllWebContents().find((contents) => contents.getURL().startsWith("meru-app:"));
      if (!shell) throw new Error("No shell page");
      await shell.executeJavaScript(${JSON.stringify(
        `window.meru.calls.selectTab(${JSON.stringify({ profileId, tabId })})`
      )});
    })()`);

  await select(CALENDAR_TAB_ID);
  await pollUntil(
    async () =>
      (await inspector.evaluate<boolean>(`(() => {
        const { webContents } = require("electron");
        return webContents.getAllWebContents().some((contents) => contents.getURL().startsWith("https://calendar.google.com/") && !contents.isLoading());
      })()`)) || undefined,
    "Calendar loading"
  );
  await select(gmailTab().id);
};

export const v4Target = (): Target => {
  const userDataDir = profileDir("measure-v4");
  const profileId = signedInProfileId(userDataDir);

  return {
    name: "v4",
    prepare: async (scenario) => {
      await writeFile(
        path.join(userDataDir, "state.json"),
        `${JSON.stringify(v4StateFor(scenario, profileId), null, 2)}\n`
      );
    },
    launch: () =>
      spawnElectron({
        appDir: outDir("prod"),
        profile: "measure-v4",
        args: {
          profile: "measure-v4",
          debugPort: undefined,
          electronArgs: ["--inspect=0"],
        },
        env: BACKGROUND,
        stdio: [...STDIO],
      }),
    hasInspector: true,
    afterUsable: async (inspector, scenario) => {
      if (scenario === "gmail-calendar") {
        await visitCalendar(inspector, profileId);
      }
    },
    electronVersion: electronVersion(),
  };
};

export const floorTarget = (): Target => {
  const userDataDir = profileDir("measure-floor");
  // A copy of v4's profile, whose session lives in that profile's partition.
  const partition = `persist:${signedInProfileId(userDataDir)}`;

  return {
    name: "floor",
    cannotRun: (scenario) =>
      scenario === "gmail" ? undefined : "the floor has one view and no tabs",
    prepare: () => Promise.resolve(),
    launch: () =>
      spawnElectron({
        appDir: path.join(import.meta.dirname, "floor"),
        profile: "measure-floor",
        args: {
          profile: "measure-floor",
          debugPort: undefined,
          electronArgs: [`--partition=${partition}`, "--inspect=0"],
        },
        stdio: [...STDIO],
      }),
    hasInspector: true,
    electronVersion: electronVersion(),
  };
};

const plistValue = (file: string, key: string) =>
  execFileSync("plutil", ["-extract", key, "raw", "-o", "-", file], {
    encoding: "utf-8",
  }).trim();

const bytesOnDisk = (directory: string) =>
  Number(
    execFileSync("du", ["-sk", directory], { encoding: "utf-8" }).split("\t")[0]
  ) * 1024;

/**
 * An installed Meru 3, launched by path on a user data directory given by
 * path. Its release build has the inspector fuse off, so the inbox is not
 * timed and renderers go unnamed.
 */
export const v3Target = (appPath: string, userDataDir: string): Target => {
  const contents = path.join(appPath, "Contents");
  const executable = path.join(
    contents,
    "MacOS",
    plistValue(path.join(contents, "Info.plist"), "CFBundleExecutable")
  );

  return {
    name: "v3",
    cannotRun: (scenario) =>
      scenario === "gmail"
        ? undefined
        : "writing v3's config for this scenario is not built",
    prepare: () => Promise.resolve(),
    launch: () =>
      spawn(executable, [`--user-data-dir=${userDataDir}`], {
        stdio: [...STDIO],
        env: { ...process.env, ...BACKGROUND },
      }),
    hasInspector: false,
    electronVersion: plistValue(
      path.join(
        contents,
        "Frameworks",
        "Electron Framework.framework",
        "Resources",
        "Info.plist"
      ),
      "CFBundleVersion"
    ),
    appBytes: bytesOnDisk(appPath),
  };
};
