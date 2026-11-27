// What the suite's build puts in place of the real thing. Each choice compares
// `MERU_E2E_BUILD` directly, so a release bundle drops the test side.
import path from "node:path";

import { isReleaseAppId } from "#core/app-identity.ts";
import { APPS, isAppId, standInApps } from "#core/apps.ts";
import type { AppId } from "#core/apps.ts";
import type { EntitlementFile } from "#core/entitlement-file.ts";
import { KEEP_ALIVE_TIMING, KEEP_ALIVE_URL } from "#core/keep-alive.ts";
import type { KeepAliveTiming } from "#core/keep-alive.ts";
import type { Log } from "#core/log.ts";
import type { Platform } from "#core/platform.ts";
import { SIGN_IN_ORIGINS } from "#core/window-open.ts";
import { capturedRelaunch } from "#platform/app.ts";
import type { AppLifecycle } from "#platform/app.ts";
import { createBadge, createCapturedBadge } from "#platform/badge.ts";
import {
  createCapturedClipboard,
  createClipboard,
} from "#platform/clipboard.ts";
import {
  createCapturedContextMenus,
  createContextMenus,
} from "#platform/context-menu.ts";
import type { ContextMenus } from "#platform/context-menu.ts";
import {
  createCapturedDefaultBrowser,
  createDefaultBrowser,
} from "#platform/default-browser.ts";
import { createCapturedDock, createDock } from "#platform/dock.ts";
import {
  createCapturedDownloadFiles,
  createCapturedSaveDialog,
  createCapturedDownloadSignals,
  createDownloadFiles,
  createDownloadSignals,
} from "#platform/downloads.ts";
import type { SaveDialog } from "#platform/downloads.ts";
import type { EntitlementServer } from "#platform/entitlement-server.ts";
import {
  createCapturedFolderPicker,
  createFolderPicker,
} from "#platform/folder-picker.ts";
import {
  createCapturedLinkPrompt,
  createLinkPrompt,
} from "#platform/link-prompt.ts";
import {
  createCapturedLoginItem,
  createHeldLoginItem,
  createLoginItem,
} from "#platform/login-item.ts";
import { keepToLoopback } from "#platform/loopback-only.ts";
import {
  createCapturedMailHandler,
  createHeldMailHandler,
  createMailHandler,
  registerWindowsMailHandler,
} from "#platform/mail-handler.ts";
import {
  createCapturedNotifier,
  createNotifier,
} from "#platform/notifications.ts";
import {
  createCapturedPageMenus,
  createPageMenus,
} from "#platform/page-menu.ts";
import {
  createCapturedPathOpener,
  createPathOpener,
} from "#platform/path-opener.ts";
import {
  createCapturedReleases,
  createGitHubReleases,
} from "#platform/releases.ts";
import {
  capturedSaveFilePicker,
  createSaveFilePicker,
} from "#platform/save-file-picker.ts";
import {
  createCapturedScreenSources,
  createScreenSources,
} from "#platform/screen-sources.ts";
import { createSoundPlayer } from "#platform/sound-player.ts";
import {
  createCapturedSystemBrowser,
  createSystemBrowser,
} from "#platform/system-browser.ts";
import {
  createCapturedTrayFactory,
  createTrayFactory,
} from "#platform/tray.ts";
import { createCapturedUpdater, createUpdater } from "#platform/updater.ts";
import { withheldScreenSources } from "#platform/withheld-screen-sources.ts";
import { withholdSystemSurfaces } from "#platform/withheld-system.ts";

import type { Entitlement } from "../entitlement.ts";
import { restorePerformanceGlobal } from "../performance-global.ts";
import type { SettingsStore } from "../settings.ts";
import { createSoundOutput } from "../sounds.ts";
import type { SoundOutput } from "../sounds.ts";
import {
  captureGmailPage,
  captureSounds,
  exposeSoundProbe,
  exposeTestEntitlement,
  exposeTestSettings,
  holdEntitlementServer,
  seedTestEntitlement,
} from "../test-hooks.ts";

/**
 * A JSON object of app ids and the stand-in URL each loads in its place, and
 * under `signIn` the stand-in for sign-in's origin.
 */
const readStandIns = (json: string | undefined) => {
  const urls: Partial<Record<AppId, string>> = {};
  let signIn: string | undefined;

  for (const [id, url] of Object.entries(
    JSON.parse(json ?? "{}") as Record<string, unknown>
  )) {
    if (typeof url !== "string") {
      continue;
    }

    if (isAppId(id)) {
      urls[id] = url;
    } else if (id === "signIn") {
      signIn = new URL(url).origin;
    }
  }

  return { urls, signIn };
};

/**
 * The apps, sign-in's origins, the keep-alive's page and timing, and the
 * context menus, each the suite's where its build runs.
 */
export const testBuildSetup = () => {
  // The suite's stand-ins for the apps and for sign-in, which only its build
  // reads.
  const standIns = MERU_E2E_BUILD
    ? readStandIns(process.env.MERU_TEST_APP_URLS)
    : undefined;
  const apps = standIns ? standInApps(standIns.urls) : APPS;

  // The suite never reaches the network: whatever its stand-ins do not serve
  // is refused and said, so no test loads a real Google page.
  if (MERU_E2E_BUILD) {
    keepToLoopback();
    withholdSystemSurfaces();
    // Playwright evaluates in main through the inspector, which a release
    // never opens.
    restorePerformanceGlobal(globalThis);
  }
  const signInOrigins = standIns?.signIn ? [standIns.signIn] : SIGN_IN_ORIGINS;
  // The sign-in stand-in's rotation page sets the cookie as Google's does.
  const keepAliveUrl = standIns?.signIn
    ? `${standIns.signIn}/RotateCookiesPage`
    : KEEP_ALIVE_URL;

  /** Seconds in place of days, for the suite's tests of it alone. */
  const keepAliveTiming: KeepAliveTiming =
    MERU_E2E_BUILD && process.env.MERU_TEST_KEEP_ALIVE === "1"
      ? {
          age: 2000,
          firstCheck: 500,
          interval: 500,
          timeout: 5000,
          retry: 2000,
        }
      : KEEP_ALIVE_TIMING;

  // The suite's build records each menu, so a test never puts one on the
  // screen, which would bring the app forward.
  const contextMenus = MERU_E2E_BUILD
    ? createCapturedContextMenus()
    : createContextMenus();

  return { apps, signInOrigins, keepAliveUrl, keepAliveTiming, contextMenus };
};

/**
 * The suite's app is never used by anyone, so it never comes in front of
 * whatever someone is working in, whatever a test shows or focuses.
 */
export const suiteRunsInBackground = () =>
  MERU_E2E_BUILD && process.env.MERU_TEST_BACKGROUND === "1";

/**
 * The suite's build, always under the background flag, captures each sound
 * in place of playing it and leaves each notification's `silent` as decided,
 * since its notifier shows nothing and its tests read the decision.
 */
export const soundOutput = (
  options: Parameters<typeof createSoundOutput>[0]
): SoundOutput => {
  if (MERU_E2E_BUILD) {
    // The addon's own playback, through no output device whatever the
    // machine has, so the packed app's addon runs and nothing is heard.
    exposeSoundProbe(
      createSoundPlayer({ sink: "none" }),
      path.join(import.meta.dirname, "sounds")
    );

    return { quiet: false, play: captureSounds() };
  }

  return createSoundOutput(options);
};

/** The suite switches settings while the app runs, as a settings page will. */
export const exposeSettingsToSuite = (settings: SettingsStore) => {
  if (MERU_E2E_BUILD) {
    exposeTestSettings(settings);
  }
};

/** The suite reads what the entitlement answers. */
export const exposeEntitlementToSuite = (entitlement: Entitlement) => {
  if (MERU_E2E_BUILD) {
    exposeTestEntitlement(entitlement);
  }
};

/** The suite's build starts a trial at launch unless its test says otherwise. */
export const suiteEntitlementFile = (
  file: EntitlementFile,
  deviceId: string
): EntitlementFile =>
  MERU_E2E_BUILD ? seedTestEntitlement(file, deviceId, Date.now()) : file;

/**
 * The suite's build lets a test hold the server's answers, through
 * `meruTestEntitlementServer`'s `hold` and `release`.
 */
export const suiteEntitlementServer = (server: EntitlementServer) => {
  if (!MERU_E2E_BUILD) {
    return server;
  }

  const { server: held, hold, release } = holdEntitlementServer(server);

  Reflect.set(globalThis, "meruTestEntitlementServer", { hold, release });

  return held;
};

/** What Gmail's pages report, recorded for the suite. */
export const gmailPageCapture = () => MERU_E2E_BUILD && captureGmailPage();

/**
 * The suite's build never writes the clipboard, which the whole desktop
 * shares.
 */
export const systemBrowser = () =>
  MERU_E2E_BUILD ? createCapturedSystemBrowser() : createSystemBrowser();

export const systemClipboard = () =>
  MERU_E2E_BUILD ? createCapturedClipboard() : createClipboard();

/**
 * The suite's build records whatever a page's menu would do to the system's
 * clipboard, spelling dictionary or screen, its developer tools included.
 */
export const systemPageMenus = (menus: ContextMenus) =>
  MERU_E2E_BUILD ? createCapturedPageMenus(menus) : createPageMenus(menus);

/**
 * The suite's build captures every notification, so a test never puts one on
 * the desktop.
 */
export const systemNotifier = () =>
  MERU_E2E_BUILD ? createCapturedNotifier() : createNotifier();

/**
 * The suite's build captures its tray, so a test never puts one in the menu
 * bar or the notification area.
 */
export const systemTrays = () =>
  MERU_E2E_BUILD
    ? createCapturedTrayFactory()
    : createTrayFactory(path.join(import.meta.dirname, "tray"));

/**
 * The suite's build records the Dock icon's showing and hiding, so a test
 * never changes the Dock of the desktop it shares.
 */
export const systemDock = () =>
  MERU_E2E_BUILD ? createCapturedDock() : createDock();

/** The suite's build records the badge in place of drawing it. */
export const systemBadge = (window: Parameters<typeof createBadge>[0]) =>
  MERU_E2E_BUILD ? createCapturedBadge() : createBadge(window);

/**
 * The suite's build saves downloads in its user data folder, never the real
 * Downloads, and records each file it would open or show.
 */
export const downloadFiles = (log: Log) =>
  MERU_E2E_BUILD ? createCapturedDownloadFiles() : createDownloadFiles(log);

/**
 * The suite's build answers each prompt before a link leaves Meru itself,
 * so a test never puts the system's alert on the desktop.
 */
export const linkPrompt = () =>
  MERU_E2E_BUILD ? createCapturedLinkPrompt() : createLinkPrompt();

/**
 * Whether the system's default browser is Meru: asked of the system by the
 * installed Meru alone, since every other build claims no link scheme, and
 * stood in for by the suite's, which never shows its alert or the system's
 * settings.
 */
export const systemDefaultBrowser = (platform: Platform) => {
  if (MERU_E2E_BUILD) {
    return createCapturedDefaultBrowser(platform);
  }

  return isReleaseAppId(MERU_APP_ID)
    ? createDefaultBrowser(platform)
    : undefined;
};

/** The suite's build records the Dock's and taskbar's progress and bounce. */
export const downloadSignals = (
  window: Parameters<typeof createDownloadSignals>[0]
) =>
  MERU_E2E_BUILD
    ? createCapturedDownloadSignals()
    : createDownloadSignals(window);

/**
 * The system's login item for the installed Meru alone; every other build
 * holds the switch for the run, and the suite's records each call, so no
 * development build ever opens at login.
 */
export const systemLoginItem = () => {
  if (MERU_E2E_BUILD) {
    return createCapturedLoginItem();
  }

  return isReleaseAppId(MERU_APP_ID)
    ? createLoginItem()
    : createHeldLoginItem();
};

/**
 * Whether the system sends email links to Meru: asked of the system and set
 * there by the installed Meru alone, since every other build claims no
 * scheme; held for the run by a development build, and stood in for by the
 * suite's, so no test or dev run changes the machine's mail handler.
 */
export const systemMailHandler = (platform: Platform) => {
  if (MERU_E2E_BUILD) {
    return createCapturedMailHandler();
  }

  return isReleaseAppId(MERU_APP_ID)
    ? createMailHandler(platform)
    : createHeldMailHandler();
};

/**
 * Lets Windows' Default apps offer the installed Meru for email links; no
 * other build writes the registry.
 */
export const registerMailHandler = async (
  platform: Platform,
  userDataPath: string
) => {
  if (MERU_E2E_BUILD) {
    return;
  }

  if (isReleaseAppId(MERU_APP_ID) && platform === "win32") {
    await registerWindowsMailHandler(userDataPath);
  }
};

/**
 * The suite's build never starts a second Meru: its relaunch says so and ends
 * the app, and the test launches again on the same folder.
 */
export const appRelaunch = (lifecycle: Pick<AppLifecycle, "relaunch">) =>
  MERU_E2E_BUILD ? capturedRelaunch : lifecycle.relaunch;

/** The suite's build answers the folder picker as the test says. */
export const folderPicker = () =>
  MERU_E2E_BUILD ? createCapturedFolderPicker() : createFolderPicker();

let capturedSaveDialog: SaveDialog | undefined;

// One stand-in, so a download's dialog and Export logs… read the same answer.
const sharedSaveDialog = () => {
  capturedSaveDialog ??= createCapturedSaveDialog();

  return capturedSaveDialog;
};

/**
 * The suite's build answers the save dialog as the test says; every other
 * build leaves it to Chromium's own.
 */
export const saveDialog = () =>
  MERU_E2E_BUILD ? sharedSaveDialog() : undefined;

/** The Save dialog for a file of Meru's own, which the suite's build answers. */
export const saveFilePicker = () =>
  MERU_E2E_BUILD
    ? capturedSaveFilePicker(sharedSaveDialog())
    : createSaveFilePicker();

/**
 * The suite's build records each file it would open, so a test never opens
 * an editor on the desktop it shares.
 */
export const pathOpener = () =>
  MERU_E2E_BUILD ? createCapturedPathOpener() : createPathOpener();

/** GitHub's list of releases, or the stand-in the suite's test answers. */
export const releasesSource = () =>
  MERU_E2E_BUILD ? createCapturedReleases() : createGitHubReleases();

/**
 * The installed Meru's updater alone, since only a release or a beta is
 * published to a feed; the suite's build gets a stand-in its test drives,
 * and every other build none, so it never checks.
 */
export const systemUpdater = async () => {
  if (MERU_E2E_BUILD) {
    return createCapturedUpdater();
  }

  return isReleaseAppId(MERU_APP_ID) ? await createUpdater() : undefined;
};

/**
 * What can be shared and the stand-in for it: the suite's build lists fixed
 * sources and never asks the system, so no test shows its Screen Recording
 * prompt or settings; nor does a run under the background flag.
 */
export const screenSources = (platform: Platform, background: boolean) => {
  if (MERU_E2E_BUILD) {
    return createCapturedScreenSources();
  }

  return background ? withheldScreenSources() : createScreenSources(platform);
};
