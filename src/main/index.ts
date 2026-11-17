import path from "node:path";

import { APPS, findApp, isAppId, standInApps } from "#core/apps.ts";
import type { AppId } from "#core/apps.ts";
import { FEED_PATH, feedOutcome } from "#core/feed.ts";
import { overlayRectangle } from "#core/overlay.ts";
import { allowsPermission } from "#core/permissions.ts";
import { profilePartition } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { findTab } from "#core/tabs.ts";
import { SIGN_IN_ORIGINS } from "#core/window-open.ts";
import { activateLanguage, resolveLanguage } from "#i18n/index.ts";
import { createAppLifecycle } from "#platform/app.ts";
import { createDevServerPolicy } from "#platform/dev-server.ts";
import { createErrorDialog } from "#platform/dialog.ts";
import { createDisplays } from "#platform/displays.ts";
import { createIpc } from "#platform/ipc.ts";
import { setApplicationMenu } from "#platform/menu.ts";
import { createNetwork } from "#platform/network.ts";
import {
  createCapturedNotifier,
  createNotifier,
} from "#platform/notifications.ts";
import { createPower } from "#platform/power.ts";
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
import { createFocus } from "./focus.ts";
import { createMailActions } from "./mail-actions.ts";
import { createMailPoller } from "./mail.ts";
import { createMailNotifications } from "./notifications.ts";
import { createOverlays } from "./overlay.ts";
import { automaticProfileName } from "./profile-copy.ts";
import { createProfiles } from "./profiles.ts";
import { createSenderRegistry } from "./senders.ts";
import {
  SETTINGS_FILE_NAME,
  createSettingsStore,
  saveSettings,
} from "./settings.ts";
import {
  createShellHandlers,
  shellSettings,
  shellState,
} from "./shell-handlers.ts";
import { serveShellContract } from "./shell-ipc.ts";
import {
  createShellWindow,
  followVibrancy,
  revealWindow,
} from "./shell-window.ts";
import { STATE_FILE_NAME, saveState } from "./state-store.ts";
import { loadStores } from "./stores.ts";
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
  const settingsFile = createTextFile(
    path.join(lifecycle.userDataPath, SETTINGS_FILE_NAME)
  );
  const stores = await loadStores({
    stateFile,
    settingsFile,
    newId,
    now: Date.now,
    log: console.error,
  });
  const profiles = createProfiles({
    initial: stores.state,
    save: (state) => saveState(stateFile, state),
    newId,
    profileName: automaticProfileName,
    clearSession: sessions.clear,
    log: console.error,
  });

  const settings = createSettingsStore({
    initial: stores.settings,
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

  followVibrancy(shell.window, settings);

  const senders = createSenderRegistry();

  senders.register(shell.window.webContentsId, { role: "shell" });

  const focus = createFocus({
    window: shell.window,
    focusWhileInactive: isTestBackground,
    resolve: (target) => {
      switch (target.kind) {
        case "shell": {
          return shell.window.focusPage;
        }
        case "overlay": {
          // oxlint-disable-next-line no-use-before-define -- resolved as focus moves, once both exist
          return overlays.focuser();
        }
        default: {
          // oxlint-disable-next-line no-use-before-define -- resolved as focus moves, once both exist
          return views.focuser();
        }
      }
    },
  });

  const overlays = createOverlays({
    focus,
    initial: profiles.get(),
    bounds: (overlay) =>
      overlayRectangle(
        shell.window.getContentAreaSize(),
        settings.get("design"),
        overlay
      ),
    log: console.error,
  });

  shell.window.onOverlay((view) => {
    view.onGone(senders.register(view.webContentsId, { role: "overlay" }));
    view.onFocus(() => {
      focus.noteFocused({ kind: "overlay" });
    });
    overlays.adopt(view);
  });
  shell.window.onPageFocus(() => {
    focus.noteFocused({ kind: "shell" });
  });
  // A press anywhere but in the overlay closes it, and goes on to where it
  // was pressed.
  shell.window.onPageMouseDown(overlays.close);
  shell.window.on("blur", overlays.close);
  shell.window.onContentAreaResize(overlays.relayout);

  const network = createNetwork();
  const gmail = findApp(apps, "gmail");
  // The registry's Gmail, or the suite's stand-in for it.
  const feedUrl = gmail && `${new URL(gmail.home).origin}${FEED_PATH}`;
  const mail = createMailPoller({
    fetchFeed: async (profileId, signal) => {
      if (!feedUrl) {
        return { kind: "failed", reason: "no Gmail" };
      }

      return feedOutcome(
        await sessions.get(profilePartition(profileId), feedUrl, signal)
      );
    },
    isOnline: network.isOnline,
    log: console.error,
  });
  const pollProfiles = (current: State) => {
    mail.reconcile(current.profiles.map((profile) => profile.id));
  };

  // A removed profile's polling stops here, before its data is cleared.
  profiles.onChange(pollProfiles);
  network.onOnline(mail.pokeAll);
  createPower().onResume(mail.pokeAll);

  const views = createTabViews({
    window: shell.window,
    apps,
    childWindowOrigins,
    background,
    systemBrowser: createSystemBrowser(),
    network,
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
    onFocus: () => {
      focus.noteFocused({ kind: "front" });
    },
    onMouseDown: overlays.close,
    // At launch and after a switch, typing reaches the page without a click.
    onFront: () => {
      focus.focus([{ kind: "front" }]);
    },
    // Gmail puts the count in its title, so the badge follows the page.
    onPageChange: (key) => {
      if (findTab(profiles.get(), key)?.app === "gmail") {
        mail.poke(key.profileId);
      }
    },
    log: console.error,
  });

  if (gmail) {
    const gmailOrigin = new URL(gmail.home).origin;
    const mailActions = createMailActions({
      post: (profileId, request, signal) =>
        sessions.post(
          profilePartition(profileId),
          `${gmailOrigin}${request.path}`,
          request.body,
          signal
        ),
      poke: mail.poke,
      log: console.error,
    });
    const mailNotifications = createMailNotifications({
      // The suite's build captures every notification, so a test never puts
      // one on the desktop.
      notifier: MERU_E2E_BUILD ? createCapturedNotifier() : createNotifier(),
      setting: settings.get,
      state: profiles.get,
      hasSubtitle: isMacOS,
      inbox: gmail.home,
      open: async (profileId, url) => {
        await views.open(profileId, gmail, url);

        try {
          await profiles.select(profileId);
        } catch (error) {
          console.error(
            `A notification's profile was not selected: ${String(error)}`
          );

          return;
        }

        if (
          !profiles.get().profiles.some((profile) => profile.id === profileId)
        ) {
          return;
        }

        // The one place main takes the foreground, since the person asked
        // for it by clicking; never under the background flag.
        revealWindow(shell.window, background);
      },
      act: (profileId, action, messageId) => {
        void mailActions.run(profileId, action, messageId);
      },
    });

    mail.onPoll(mailNotifications.polled);
    profiles.onChange(mailNotifications.follow);
  }

  views.reconcile(profiles.get());
  pollProfiles(profiles.get());
  profiles.onChange(views.reconcile);
  // After the views, so focus handed back finds the new front tab's.
  profiles.onChange(overlays.follow);
  settings.onChange("design", views.relayout);
  settings.onChange("design", overlays.relayout);

  const menu = createApplicationMenu({
    platform: process.platform as Platform,
    appName: lifecycle.name,
    commands: commandsFor(process.platform as Platform),
    context: () => ({ state: profiles.get(), setting: settings.get }),
    actions: {
      updateSetting: settings.update,
      reloadSelectedTab: views.reloadFront,
      selectTab: profiles.selectTab,
      closeTab: profiles.closeTab,
      selectProfile: profiles.select,
      addProfile: profiles.add,
      openRenameProfile: (profileId) => {
        overlays.open({ kind: "rename-profile", profileId });
      },
    },
    setMenu: setApplicationMenu,
    ...(MERU_BUILD_MODE === "dev" && {
      developerTools: { role: "toggleDevTools" as const },
    }),
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
      overlays,
      tabs: views,
      window: shell.window,
      log: console.error,
    }),
    state: {
      read: () =>
        shellState(
          profiles.get(),
          views.status,
          shellSettings(settings.get, isMacOS),
          overlays.current(),
          mail.mail
        ),
      onChange: (listener) => {
        profiles.onChange(listener);
        mail.onChange(listener);
        views.onChange(listener);
        overlays.onChange(listener);
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
