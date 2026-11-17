import path from "node:path";

import { APPS, findApp, isAppId, standInApps } from "#core/apps.ts";
import type { AppId } from "#core/apps.ts";
import { FEED_PATH, feedOutcome, inboxLabel } from "#core/feed.ts";
import { GMAIL_FEATURES, gmailFeatures } from "#core/gmail-hooks.ts";
import { IMPORTANT_LABEL } from "#core/notification-gate.ts";
import { overlayRectangle } from "#core/overlay.ts";
import { allowsPermission } from "#core/permissions.ts";
import type { Platform } from "#core/platform.ts";
import { hasTabbedInbox, profilePartition } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { findTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import { totalUnread } from "#core/unread.ts";
import { extractVerificationCode } from "#core/verification-code.ts";
import { SIGN_IN_ORIGINS } from "#core/window-open.ts";
import { activateLanguage, i18n, resolveLanguage } from "#i18n/index.ts";
import { createAppLifecycle } from "#platform/app.ts";
import { createBadge, createCapturedBadge } from "#platform/badge.ts";
import {
  createCapturedClipboard,
  createClipboard,
} from "#platform/clipboard.ts";
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
import { createTextFile, readTextUpTo } from "#platform/text-file.ts";
import { createTheme } from "#platform/theme.ts";
import {
  createCapturedTrayFactory,
  createTrayFactory,
} from "#platform/tray.ts";
import { createWindowFactory } from "#platform/window.ts";

import { createApplicationMenu } from "./application-menu.ts";
import { createUnreadBadge } from "./badge.ts";
import { createCatchUp } from "./catch-up.ts";
import { COMMANDS } from "./commands.ts";
import { createContentSecurityPolicy } from "./content-security-policy.ts";
import { createDevContentSecurityPolicy, readDevServer } from "./dev-server.ts";
import { createDoNotDisturb } from "./do-not-disturb.ts";
import { createFailures } from "./failures.ts";
import { createFocus } from "./focus.ts";
import { createGmailNavigation } from "./gmail-navigation.ts";
import { serveGmailContract } from "./gmail-page.ts";
import { createInboxTypes } from "./inbox-types.ts";
import { createInbox } from "./inbox.ts";
import { createMailActions } from "./mail-actions.ts";
import { createMailPoller } from "./mail.ts";
import { createMailNotifications } from "./notifications.ts";
import { createOverlays } from "./overlay.ts";
import { automaticProfileName } from "./profile-copy.ts";
import { createProfiles } from "./profiles.ts";
import type { Profiles } from "./profiles.ts";
import { createSenderRegistry } from "./senders.ts";
import type { SenderRegistry } from "./senders.ts";
import {
  SETTINGS_FILE_NAME,
  createSettingsStore,
  saveSettings,
} from "./settings.ts";
import type { SettingsStore } from "./settings.ts";
import {
  createShellHandlers,
  shellShortcuts,
  shellState,
} from "./shell-handlers.ts";
import { serveShellContract } from "./shell-ipc.ts";
import {
  createShellWindow,
  hideOnClose,
  revealWindow,
} from "./shell-window.ts";
import { createShowGmail } from "./show-gmail.ts";
import { createSidebar } from "./sidebar.ts";
import { createSoundOutput } from "./sounds.ts";
import type { SoundOutput } from "./sounds.ts";
import { STATE_FILE_NAME, saveState } from "./state-store.ts";
import { loadStores } from "./stores.ts";
import { createTabViews } from "./tab-views.ts";
import {
  captureGmailPage,
  captureSounds,
  exposeTestSettings,
} from "./test-hooks.ts";
import { createTray } from "./tray.ts";
import {
  USER_STYLES_FILE_NAME,
  USER_STYLES_MAX_BYTES,
  createUserStyles,
} from "./user-styles.ts";

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
const signInOrigins = standIns?.signIn ? [standIns.signIn] : SIGN_IN_ORIGINS;

/** v3's account id, so a profile id is the account id v3 would have made. */
const newId = () => crypto.randomUUID();

/** The role's own key on Windows and Linux, Ctrl+Shift+I, is the unified inbox's. */
const devToolsAccelerator = (platform: Platform) =>
  platform === "darwin" ? "Alt+Command+I" : "F12";

/**
 * The suite's build, always under the background flag, captures each sound
 * in place of playing it and leaves each notification's `silent` as decided,
 * since its notifier shows nothing and its tests read the decision.
 */
const soundOutput = (
  options: Parameters<typeof createSoundOutput>[0]
): SoundOutput =>
  MERU_E2E_BUILD
    ? { quiet: false, play: captureSounds() }
    : createSoundOutput(options);

/**
 * Gmail's page contract, its switches following the settings, which the
 * suite's build alone may also switch from outside. Answers with what tells
 * a profile's page to catch up, at most every 2 s.
 */
const serveGmailPage = ({
  gmailOrigin,
  senders,
  profiles,
  settings,
  userStyles,
}: {
  gmailOrigin: string | undefined;
  senders: SenderRegistry;
  profiles: Pick<Profiles, "get">;
  settings: SettingsStore;
  userStyles: () => Promise<string>;
}) => {
  // The suite switches settings while the app runs, as a settings page will.
  if (MERU_E2E_BUILD) {
    exposeTestSettings(settings);
  }

  if (gmailOrigin === undefined) {
    return { catchUp: createCatchUp(() => false), navigate: () => false };
  }

  const gmailPage = serveGmailContract({
    ipc: createIpc(),
    senders,
    isGmailTab: (key) => findTab(profiles.get(), key)?.app === "gmail",
    gmailOrigin,
    features: () => gmailFeatures(settings.get),
    userStyles,
    ...(MERU_E2E_BUILD && captureGmailPage()),
    log: console.error,
  });

  for (const feature of GMAIL_FEATURES) {
    settings.onChange(feature, gmailPage.push);
  }

  return {
    catchUp: createCatchUp(gmailPage.catchUp),
    navigate: gmailPage.navigate,
  };
};

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

  const platform = process.platform as Platform;
  const isMacOS = platform === "darwin";
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
    now: Date.now,
    log: console.error,
  });
  // Ahead of every other listener of the profiles, so each reads the
  // sidebar as the change leaves it.
  const sidebar = createSidebar({ profiles });
  const doNotDisturb = createDoNotDisturb({
    profiles,
    now: () => new Date(),
    log: console.error,
  });

  const settings = createSettingsStore({
    initial: stores.settings,
    save: (next) => saveSettings(settingsFile, next),
    platform,
    log: console.error,
  });

  // Not awaited: the window must not wait on a clear that hangs, and no view
  // can hold these sessions, whose profiles are no longer listed.
  profiles.finishClears();

  const shellUrl = new URL(shellSource.url);

  shellUrl.searchParams.set("lang", language);

  // Built by hand: URL's `origin` is "null" for a scheme it does not know.
  const shellOrigin = `${shellUrl.protocol}//${shellUrl.host}`;
  const ipc = createIpc();

  const theme = createTheme();
  const shell = createShellWindow({
    windows: createWindowFactory(),
    displays: createDisplays(),
    title: lifecycle.name,
    url: shellUrl.href,
    preloadPath: path.join(import.meta.dirname, "preload-shell.cjs"),
    isMacOS,
    background,
    theme,
  });

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
        sidebar.current(),
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
  const gmailHome = gmail?.home ?? "";
  // The registry's Gmail, or the suite's stand-in for it.
  const gmailOrigin = gmail && new URL(gmail.home).origin;
  const feedUrl = gmailOrigin && `${gmailOrigin}${FEED_PATH}`;
  const isGmailTab = (key: TabKey) =>
    findTab(profiles.get(), key)?.app === "gmail";
  const inboxTypes = createInboxTypes({
    gmailOrigin,
    isGmailTab,
    isTabbed: (profileId) => hasTabbedInbox(profiles.get(), profileId),
    setTabbed: profiles.setTabbedInbox,
    // The badge follows at once rather than at the next poll.
    // oxlint-disable-next-line no-use-before-define -- the poller reads what this learns
    onChange: (profileId) => mail.poke(profileId),
    log: console.error,
  });
  const mail = createMailPoller({
    inboxLabel: (profileId) =>
      inboxLabel(hasTabbedInbox(profiles.get(), profileId)),
    fetchFeed: async (profileId, signal, label) => {
      if (!feedUrl) {
        return { kind: "failed", reason: "no Gmail" };
      }

      return feedOutcome(
        await sessions.get(
          profilePartition(profileId),
          label === undefined ? feedUrl : `${feedUrl}/${label}`,
          signal
        )
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

  const power = createPower();

  power.onResume(mail.pokeAll);
  power.onResume(doNotDisturb.resume);

  const preloads = new Map([
    ["gmail", path.join(import.meta.dirname, "preload-gmail.cjs")],
  ]);
  const views = createTabViews({
    sidebar: sidebar.current,
    window: shell.window,
    apps,
    signInOrigins,
    background,
    systemBrowser: createSystemBrowser(),
    network,
    senders,
    state: profiles.get,
    // oxlint-disable-next-line no-use-before-define -- the inbox opens messages in the views
    inboxOpen: () => inbox.isOpen(),
    openTab: profiles.openTab,
    newId,
    addProfile: async () => {
      await profiles.add();
      // oxlint-disable-next-line no-use-before-define -- as the shell's Add Profile, adding closes the inbox
      inbox.setOpen(false);
    },
    // No key reaches a view before the menu below exists, as nothing between
    // them awaits.
    // oxlint-disable-next-line no-use-before-define -- the menu runs the views' commands
    handleKey: (input) => menu.handleKey(input),
    preloadFor: (app) => preloads.get(app),
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
      if (isGmailTab(key)) {
        mail.pokeForPage(key.profileId);
      }
    },
    onLoaded: (key, page) => {
      void inboxTypes.loaded(key, page);
    },
    log: console.error,
  });

  const showGmail = createShowGmail({
    state: profiles.get,
    openInGmailTab: async (profileId, url) => {
      if (gmail) {
        await views.open(profileId, gmail, url);
      }
    },
    selectTab: profiles.selectTab,
    selectProfile: profiles.select,
    closeInbox: () => {
      // oxlint-disable-next-line no-use-before-define -- the inbox opens messages through this
      inbox.setOpen(false);
    },
    log: console.error,
  });
  const gmailPage = serveGmailPage({
    gmailOrigin,
    senders,
    profiles,
    settings,
    userStyles: createUserStyles({
      read: () =>
        readTextUpTo(
          path.join(lifecycle.userDataPath, USER_STYLES_FILE_NAME),
          USER_STYLES_MAX_BYTES
        ),
      log: console.error,
    }),
  });
  const { catchUp } = gmailPage;
  const navigateGmail = createGmailNavigation({
    send: gmailPage.navigate,
    jumpTo: showGmail.jumpTo,
    openMessage: showGmail.openMessage,
    // The person asked for it from the menu or a shortcut, so, as a
    // notification's click, it may take the foreground; never under the
    // background flag.
    reveal: () => {
      revealWindow(shell.window, background);
    },
    home: gmailHome,
  });

  // A removed profile's pending catch-up is dropped with it.
  profiles.onChange(catchUp.follow);
  // Gmail's own push channel can stay down for minutes after a wake.
  power.onResume(() => {
    catchUp.requestAll(profiles.get());
  });

  const mailActions =
    gmailOrigin === undefined
      ? undefined
      : createMailActions({
          post: (profileId, request, signal) =>
            sessions.post(
              profilePartition(profileId),
              `${gmailOrigin}${request.path}`,
              request.body,
              signal
            ),
          poke: mail.poke,
          catchUp: catchUp.request,
          log: console.error,
        });
  const inbox = createInbox({
    mail,
    run: (profileId, action, messageId) =>
      mailActions
        ? mailActions.run(profileId, action, messageId)
        : Promise.resolve({ kind: "failed", reason: "no Gmail" }),
    open: async (profileId, url) => {
      await showGmail.openMessage(profileId, url);
    },
    inbox: gmailHome,
    initial: profiles.get(),
    focus,
    closeOverlay: overlays.close,
    log: console.error,
  });

  mail.onPoll(inbox.polled);

  if (gmail && mailActions) {
    const mailNotifications = createMailNotifications({
      // The suite's build captures every notification, so a test never puts
      // one on the desktop.
      notifier: MERU_E2E_BUILD ? createCapturedNotifier() : createNotifier(),
      // Nor writes the clipboard, which the whole desktop shares.
      clipboard: MERU_E2E_BUILD ? createCapturedClipboard() : createClipboard(),
      extractCode: extractVerificationCode,
      setting: settings.get,
      state: profiles.get,
      hasSubtitle: isMacOS,
      inbox: gmail.home,
      open: async (profileId, url) => {
        if (!(await showGmail.openMessage(profileId, url))) {
          return;
        }

        // The one place main takes the foreground, since the person asked
        // for it by clicking; never under the background flag.
        revealWindow(shell.window, background);
      },
      act: (profileId, action, messageId) => {
        void mailActions.run(profileId, action, messageId);
      },
      doNotDisturb: () => profiles.get().doNotDisturb,
      now: () => new Date(),
      important: async (profileId) => {
        const outcome = await mail.readLabel(profileId, IMPORTANT_LABEL);

        return outcome.kind === "feed"
          ? new Set(outcome.feed.entries.map((entry) => entry.id))
          : null;
      },
      sound: soundOutput({
        ipc,
        shellId: shell.window.webContentsId,
        shellOrigin,
        background,
        log: console.error,
      }),
      log: console.error,
    });

    // A removed profile's actions stop here, before its data is cleared.
    profiles.onChange(mailActions.follow);
    mail.onPoll((profileId, outcome, _startedAt, label) => {
      void mailNotifications.polled(profileId, outcome, label);
    });
    profiles.onChange(mailNotifications.follow);
  }

  views.reconcile(profiles.get());
  pollProfiles(profiles.get());
  // Ahead of the views, so a switch that closes the inbox shows the new
  // front tab in one pass.
  profiles.onChange(inbox.follow);
  profiles.onChange(views.reconcile);
  inbox.onChange(() => {
    views.reconcile(profiles.get());
  });
  // After the views, so focus handed back finds the new front tab's.
  profiles.onChange(overlays.follow);
  sidebar.onChange(views.relayout);
  sidebar.onChange(overlays.relayout);

  const menu = createApplicationMenu({
    platform,
    appName: lifecycle.name,
    commands: COMMANDS,
    context: () => ({
      state: profiles.get(),
      doNotDisturb: doNotDisturb.current(),
      inboxOpen: inbox.isOpen(),
      sidebarShown: sidebar.current() !== "hidden",
    }),
    actions: {
      reloadSelectedTab: views.reloadFront,
      selectTab: profiles.selectTab,
      closeTab: profiles.closeTab,
      selectProfile: profiles.select,
      addProfile: profiles.add,
      openRenameProfile: (profileId) => {
        overlays.open({ kind: "rename-profile", profileId });
      },
      switchDoNotDisturb: (choice) =>
        choice === "off"
          ? doNotDisturb.switchOff()
          : doNotDisturb.switchOn(choice),
      setInboxOpen: inbox.setOpen,
      toggleSidebar: sidebar.toggleShown,
      navigateGmail,
      saveSearch: profiles.saveSearch,
      removeSavedSearch: profiles.removeSavedSearch,
    },
    locale: () => i18n.locale,
    setMenu: setApplicationMenu,
    ...(MERU_BUILD_MODE === "dev" && {
      developerTools: {
        role: "toggleDevTools" as const,
        accelerator: devToolsAccelerator(platform),
      },
    }),
    log: console.error,
  });

  profiles.onChange(menu.refresh);
  inbox.onChange(menu.refresh);
  sidebar.onChange(menu.refresh);

  const shortcuts = shellShortcuts(COMMANDS, platform);

  serveShellContract({
    ipc,
    senders,
    shellOrigin,
    handlers: createShellHandlers({
      profiles,
      overlays,
      tabs: views,
      inbox,
      window: shell.window,
      sidebar,
      runCommand: menu.runCommand,
      doNotDisturbItems: menu.doNotDisturbItems,
      log: console.error,
    }),
    state: {
      read: () =>
        shellState(
          profiles.get(),
          views.status,
          overlays.current(),
          mail.mail,
          doNotDisturb.current(),
          inbox.shellSlice(),
          { sidebar: { state: sidebar.current() }, shortcuts }
        ),
      onChange: (listener) => {
        profiles.onChange(listener);
        mail.onChange(listener);
        views.onChange(listener);
        overlays.onChange(listener);
        inbox.onChange(listener);
        sidebar.onChange(listener);
      },
    },
    log: console.error,
  });

  const reveal = () => {
    revealWindow(shell.window, background);
  };
  const unread = (profileId: string) => mail.mail(profileId).unreadCount;
  const tray = createTray({
    // The suite's build captures its tray, so a test never puts one in the
    // menu bar or the notification area.
    trays: MERU_E2E_BUILD
      ? createCapturedTrayFactory()
      : createTrayFactory(path.join(import.meta.dirname, "tray")),
    platform,
    productName: lifecycle.name,
    setting: settings.get,
    isDark: theme.isDark,
    state: profiles.get,
    unread,
    window: shell.window,
    reveal,
    jumpTo: showGmail.jumpTo,
    quit: lifecycle.quit,
    log: console.error,
  });
  const badge = createUnreadBadge({
    badge: MERU_E2E_BUILD ? createCapturedBadge() : createBadge(shell.window),
    platform,
    enabled: () => settings.get("unreadBadge"),
    total: () =>
      totalUnread(profiles.get().profiles.map((profile) => unread(profile.id))),
  });
  const showUnread = () => {
    tray.update();
    badge.update();
  };

  mail.onChange(showUnread);
  profiles.onChange(showUnread);
  settings.onChange("unreadBadge", badge.update);
  settings.onChange("trayIconColor", tray.update);
  settings.onChange("trayUnreadCount", tray.update);
  settings.onChange("tray", () => {
    tray.update();

    // Off, the tray can no longer bring a hidden window back on Windows and
    // Linux.
    if (!tray.isShown() && !isMacOS && !shell.window.isVisible()) {
      reveal();
    }
  });
  theme.onChange(tray.update);
  // The menu's Show or Hide follows the window.
  shell.window.on("show", tray.update);
  shell.window.on("hide", tray.update);
  shell.window.on("minimize", tray.update);
  shell.window.on("restore", tray.update);
  showUnread();

  const closing = hideOnClose({
    window: shell.window,
    platform,
    trayShown: tray.isShown,
  });

  lifecycle.onBeforeQuit(() => {
    closing.markQuitting();
    doNotDisturb.dispose();
    badge.close();
    tray.close();
  });

  lifecycle.onActivate(reveal);
  lifecycle.onSecondInstance(reveal);

  lifecycle.onWindowAllClosed(() => {
    lifecycle.quit();
  });

  await shell.load();

  failures.markStarted();
};

// Not awaited: Electron holds its `ready` event until an ESM entry has finished
// evaluating, so a top-level await on `whenReady()` would never return.
start().catch(failures.report);
