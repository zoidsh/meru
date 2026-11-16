import path from "node:path";

import { APPS, isAppId, standInApps } from "#core/apps.ts";
import type { AppId } from "#core/apps.ts";
import { allowsPermission } from "#core/permissions.ts";
import { SIGN_IN_ORIGINS } from "#core/window-open.ts";
import { activateLanguage, resolveLanguage } from "#i18n/index.ts";
import { createAppLifecycle } from "#platform/app.ts";
import { createDevServerPolicy } from "#platform/dev-server.ts";
import { createErrorDialog } from "#platform/dialog.ts";
import { createDisplays } from "#platform/displays.ts";
import { createIpc } from "#platform/ipc.ts";
import { setApplicationMenu } from "#platform/menu.ts";
import { createNetwork } from "#platform/network.ts";
import { createAppProtocol } from "#platform/protocol.ts";
import { createSessions } from "#platform/sessions.ts";
import { createSystemBrowser } from "#platform/system-browser.ts";
import { createTextFile } from "#platform/text-file.ts";
import { createWindowFactory } from "#platform/window.ts";

import { createApplicationMenu } from "./application-menu.ts";
import { commandsFor } from "./commands.ts";
import type { Platform } from "./commands.ts";
import { createContentSecurityPolicy } from "./content-security-policy.ts";
import { createDevContentSecurityPolicy, readDevServer } from "./dev-server.ts";
import { createFailures } from "./failures.ts";
import { automaticProfileName } from "./profile-copy.ts";
import { createProfiles } from "./profiles.ts";
import { createSenderRegistry } from "./senders.ts";
import {
  SETTINGS_FILE_NAME,
  createSettingsStore,
  loadSettings,
  saveSettings,
} from "./settings.ts";
import {
  createShellHandlers,
  shellSettings,
  shellState,
} from "./shell-handlers.ts";
import { serveShellContract } from "./shell-ipc.ts";
import { createShellWindow, revealWindow } from "./shell-window.ts";
import { STATE_FILE_NAME, loadState, saveState } from "./state-store.ts";
import { createTabViews } from "./tab-views.ts";

const APP_SCHEME = "meru-app";

const SHELL_HOST = "shell";

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

// The suite's stand-ins for the apps and for sign-in, which only its build
// reads.
const standIns = MERU_E2E_BUILD
  ? readStandIns(process.env.MERU_TEST_APP_URLS)
  : undefined;
const apps = standIns ? standInApps(standIns.urls) : APPS;
const childWindowOrigins = standIns?.signIn
  ? [standIns.signIn]
  : SIGN_IN_ORIGINS;

/** v3's account id, so a profile id is the account id v3 would have made. */
const newId = () => crypto.randomUUID();

const lifecycle = createAppLifecycle();
const errorDialog = createErrorDialog();

const failures = createFailures({
  productName: lifecycle.name,
  showErrorDialog: errorDialog.show,
  log: console.error,
  exit: lifecycle.exit,
});

process.on("uncaughtException", failures.report);
process.on("unhandledRejection", failures.report);

lifecycle.onBeforeQuit(failures.markQuitting);

const resolveShell = () => {
  if (MERU_BUILD_MODE === "dev") {
    const devServer = readDevServer(process.env);

    return {
      url: devServer.url,
      apply: () => {
        createDevServerPolicy().apply({
          origin: new URL(devServer.url).origin,
          contentSecurityPolicy: createDevContentSecurityPolicy(devServer),
        });
      },
    };
  }

  return {
    url: `${APP_SCHEME}://${SHELL_HOST}/index.html`,
    apply: (appProtocol: ReturnType<typeof createAppProtocol>) => {
      appProtocol.serve({
        scheme: APP_SCHEME,
        root: import.meta.dirname,
        hosts: [SHELL_HOST],
        contentSecurityPolicy: createContentSecurityPolicy(),
      });
    },
  };
};

const start = async () => {
  const shellSource = resolveShell();

  // The suite's app is never used by anyone, so it never comes in front of
  // whatever someone is working in, whatever a test shows or focuses.
  const isTestBackground =
    MERU_E2E_BUILD && process.env.MERU_TEST_BACKGROUND === "1";

  if (isTestBackground) {
    lifecycle.preventActivation();
  }

  // For a desktop other sessions share: open behind whatever is in front.
  const background =
    isTestBackground ||
    process.env.MERU_BACKGROUND === "1" ||
    process.argv.includes("--background");

  if (!lifecycle.requestSingleInstanceLock()) {
    lifecycle.quit();

    return;
  }

  // Guards a GNOME crash in GTK 4.
  if (process.platform === "linux") {
    lifecycle.appendSwitch("gtk-version", "3");
  }

  if (process.platform === "win32") {
    lifecycle.setAppUserModelId(MERU_APP_ID);
  }

  const appProtocol = createAppProtocol();

  appProtocol.registerPrivilegedScheme(APP_SCHEME);

  await lifecycle.whenReady();

  shellSource.apply(appProtocol);

  const language = resolveLanguage(lifecycle.preferredLanguages());

  activateLanguage(language);

  const isMacOS = process.platform === "darwin";
  const sessions = createSessions();
  const stateFile = createTextFile(
    path.join(lifecycle.userDataPath, STATE_FILE_NAME)
  );
  const profiles = createProfiles({
    initial: await loadState({
      file: stateFile,
      newId,
      now: Date.now,
      log: console.error,
    }),
    save: (state) => saveState(stateFile, state),
    newId,
    profileName: automaticProfileName,
    clearSession: sessions.clear,
    log: console.error,
  });

  const settingsFile = createTextFile(
    path.join(lifecycle.userDataPath, SETTINGS_FILE_NAME)
  );
  const settings = createSettingsStore({
    initial: await loadSettings({
      file: settingsFile,
      now: Date.now,
      log: console.error,
    }),
    save: (next) => saveSettings(settingsFile, next),
    log: console.error,
  });

  // Not awaited: the window must not wait on a clear that hangs, and no view
  // can hold these sessions, whose profiles are no longer listed.
  profiles.finishClears();

  const shellUrl = new URL(shellSource.url);

  shellUrl.searchParams.set("lang", language);

  const shell = createShellWindow({
    windows: createWindowFactory(),
    displays: createDisplays(),
    title: lifecycle.name,
    url: shellUrl.href,
    preloadPath: path.join(import.meta.dirname, "preload-shell.cjs"),
    isMacOS,
    background,
    vibrancy: settings.get("vibrancy"),
  });

  settings.onChange("vibrancy", () => {
    shell.window.setVibrancy(settings.get("vibrancy"));
  });

  const senders = createSenderRegistry();

  senders.register(shell.window.webContentsId, { role: "shell" });

  const views = createTabViews({
    window: shell.window,
    apps,
    childWindowOrigins,
    background,
    systemBrowser: createSystemBrowser(),
    network: createNetwork(),
    senders,
    state: profiles.get,
    design: () => settings.get("design"),
    openTab: profiles.openTab,
    newId,
    // No key reaches a view before the menu below exists, as nothing between
    // them awaits.
    // oxlint-disable-next-line no-use-before-define -- the menu runs the views' commands
    handleKey: (input) => menu.handleKey(input),
    prepareSession: (partition) => {
      sessions.guard(partition, (ask) => allowsPermission(apps, ask));
    },
    updatePages: profiles.updatePages,
    log: console.error,
  });

  views.reconcile(profiles.get());
  profiles.onChange(views.reconcile);
  settings.onChange("design", views.relayout);

  const menu = createApplicationMenu({
    platform: process.platform as Platform,
    appName: lifecycle.name,
    commands: commandsFor(process.platform as Platform),
    context: () => ({ state: profiles.get(), setting: settings.get }),
    actions: {
      setSetting: settings.set,
      reloadSelectedTab: views.reloadFront,
      selectTab: profiles.selectTab,
      closeTab: profiles.closeTab,
      selectProfile: profiles.select,
      addProfile: profiles.add,
    },
    setMenu: setApplicationMenu,
    log: console.error,
  });

  profiles.onChange(menu.refresh);
  settings.onChange("design", menu.refresh);
  settings.onChange("vibrancy", menu.refresh);

  serveShellContract({
    ipc: createIpc(),
    senders,
    // Built by hand: URL's `origin` is "null" for a scheme it does not know.
    shellOrigin: `${shellUrl.protocol}//${shellUrl.host}`,
    handlers: createShellHandlers({
      profiles,
      tabs: views,
      window: shell.window,
      log: console.error,
    }),
    state: {
      read: () =>
        shellState(
          profiles.get(),
          views.status,
          shellSettings(settings.get, isMacOS)
        ),
      onChange: (listener) => {
        profiles.onChange(listener);
        views.onChange(listener);
        settings.onChange("design", listener);
        settings.onChange("vibrancy", listener);
      },
    },
    log: console.error,
  });

  lifecycle.onSecondInstance(() => {
    revealWindow(shell.window, background);
  });

  lifecycle.onWindowAllClosed(() => {
    lifecycle.quit();
  });

  await shell.load();

  failures.markStarted();
};

// Not awaited: Electron holds its `ready` event until an ESM entry has finished
// evaluating, so a top-level await on `whenReady()` would never return.
start().catch(failures.report);
