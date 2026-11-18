import path from "node:path";

import { isEqual } from "es-toolkit";

import { IMPORTANT_LABEL } from "#core/notification-gate.ts";
import {
  OVERLAY_FRAME_NAME,
  coversPage,
  overlayRectangle,
  staysOpenOutside,
} from "#core/overlay.ts";
import { ownWindowFindOfFrame, ownWindowOfFrame } from "#core/own-window.ts";
import { allowsPermission } from "#core/permissions.ts";
import type { Platform } from "#core/platform.ts";
import { windowBackground } from "#core/shell-grey.ts";
import { gmailOwnWindow } from "#core/state.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import { extractVerificationCode } from "#core/verification-code.ts";
import { activateLanguage, resolveLanguage } from "#i18n/index.ts";
import { createAppLifecycle } from "#platform/app.ts";
import { createDevServerPolicy } from "#platform/dev-server.ts";
import { createErrorDialog } from "#platform/dialog.ts";
import { createDisplays } from "#platform/displays.ts";
import { createIpc } from "#platform/ipc.ts";
import { createOwnWindowFactory } from "#platform/own-window.ts";
import { createAppProtocol } from "#platform/protocol.ts";
import { createSessions } from "#platform/sessions.ts";
import { createSystemBrowser } from "#platform/system-browser.ts";
import { createTextFile } from "#platform/text-file.ts";
import { createTheme } from "#platform/theme.ts";
import { createWindowFactory } from "#platform/window.ts";

import { createContentSecurityPolicy } from "./content-security-policy.ts";
import { createDevContentSecurityPolicy, readDevServer } from "./dev-server.ts";
import { createDoNotDisturb } from "./do-not-disturb.ts";
import { createFailures } from "./failures.ts";
import { createFind } from "./find.ts";
import { createFocus } from "./focus.ts";
import type { FocusTarget } from "./focus.ts";
import { createMailNotifications } from "./notifications.ts";
import { createOverlays } from "./overlay.ts";
import { createOwnWindows } from "./own-windows.ts";
import { automaticProfileName } from "./profile-copy.ts";
import { createProfiles } from "./profiles.ts";
import { createSenderRegistry } from "./senders.ts";
import {
  SETTINGS_FILE_NAME,
  createSettingsStore,
  saveSettings,
} from "./settings.ts";
import { createShellWindow } from "./shell-window.ts";
import { createSidebar } from "./sidebar.ts";
import { STATE_FILE_NAME, saveState } from "./state-store.ts";
import { loadStores } from "./stores.ts";
import { createTabViews } from "./tab-views.ts";
import { revealWindow } from "./windows.ts";
import { wireGmail } from "./wiring/gmail.ts";
import { wireKeepAlive } from "./wiring/keep-alive.ts";
import { wireLauncher } from "./wiring/launcher.ts";
import { wireMailFeed } from "./wiring/mail-feed.ts";
import { wireMenu } from "./wiring/menu.ts";
import { wireShellContract } from "./wiring/shell-contract.ts";
import {
  soundOutput,
  suiteRunsInBackground,
  systemClipboard,
  systemNotifier,
  testBuildSetup,
} from "./wiring/test-build.ts";
import { wireTray } from "./wiring/tray.ts";

const APP_SCHEME = "meru-app";

const SHELL_HOST = "shell";

/** The longest a quit waits for the last writes of the state. */
const QUIT_WAIT_MS = 3000;

const { apps, signInOrigins, keepAliveUrl, keepAliveTiming, contextMenus } =
  testBuildSetup();

/** v3's account id, so a profile id is the account id v3 would have made. */
const newId = () => crypto.randomUUID();

/** Where keys go in a tab's own window: its find bar while open, else its page. */
const inOwnWindow = (key: TabKey): FocusTarget[] => [
  { kind: "windowFind", key },
  { kind: "window", key },
];

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

  const isTestBackground = suiteRunsInBackground();

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
  const displays = createDisplays();
  const shell = createShellWindow({
    windows: createWindowFactory(contextMenus),
    displays,
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
    // oxlint-disable-next-line no-use-before-define -- asked as focus moves, once both exist
    overlayCoversPages: () => coversPage(overlays.current()),
    // oxlint-disable-next-line no-use-before-define -- asked as focus moves, once both exist
    ownWindow: (key) => ownWindows.window(key),
    resolve: (target) => {
      switch (target.kind) {
        case "shell": {
          return shell.window.focusPage;
        }
        case "overlay": {
          // oxlint-disable-next-line no-use-before-define -- resolved as focus moves, once both exist
          return overlays.focuser();
        }
        case "window": {
          // oxlint-disable-next-line no-use-before-define -- resolved as focus moves, once both exist
          return views.ownWindowFocuser(target.key);
        }
        case "windowFind": {
          // oxlint-disable-next-line no-use-before-define -- resolved as focus moves, once both exist
          return find.bar(target.key)
            ? // oxlint-disable-next-line no-use-before-define -- resolved as focus moves, once both exist
              ownWindows.findFocuser(target.key)
            : undefined;
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
        overlay,
        overlay.kind === "find"
          ? // oxlint-disable-next-line no-use-before-define -- placed as the overlay opens, once both exist
            views.panes()?.find((pane) => pane.tabId === overlay.tabId)
          : undefined
      ),
    log: console.error,
  });

  const ownWindows = createOwnWindows({
    windows: createOwnWindowFactory(contextMenus),
    displays,
    apps,
    state: profiles.get,
    isMacOS,
    background,
    backgroundColor: () => windowBackground(theme.isDark()),
    closeTab: profiles.closeTab,
    saveBounds: profiles.setOwnWindowBounds,
    // Keys go to its find bar while that is open, else its page, as in the
    // main window, so typing after switching back never reaches the page's
    // own shortcuts.
    onFocus: (key) => {
      focus.focusInWindow(key, inOwnWindow(key));
    },
    log: console.error,
  });

  theme.onChange(ownWindows.recolor);
  profiles.onChange(ownWindows.retitle);
  // Before the windows close, so closing them leaves their tabs where they are.
  lifecycle.onBeforeQuit(ownWindows.markQuitting);
  shell.window.onSessionEnd(ownWindows.markQuitting);
  // Where each window was, saved as they close, and any other change still
  // being written.
  lifecycle.holdQuitFor(
    () => Promise.allSettled([ownWindows.saved(), profiles.settled()]),
    QUIT_WAIT_MS
  );

  /** The web contents of the shell's documents open now, which never zoom. */
  const shellDocumentIds = new Set<number>();

  shell.window.onShellDocument((view, frameName) => {
    const id = view.webContentsId;

    shellDocumentIds.add(id);
    view.onGone(() => shellDocumentIds.delete(id));
    // None has a bridge of its own; the shell draws into each.
    view.onGone(senders.register(view.webContentsId, { role: "overlay" }));
    // oxlint-disable-next-line no-use-before-define -- no key reaches a document before the menu exists
    view.onKey((input) => menu.handleKey(input));

    const findWindow = ownWindowFindOfFrame(frameName);

    if (findWindow) {
      // Keys there act on that window's tab, as in its page.
      view.onFocus(() => {
        focus.noteFocused({ kind: "window", key: findWindow });
      });
      ownWindows.adoptFind(findWindow, view);

      // oxlint-disable-next-line no-use-before-define -- no document opens before startup ends
      if (barsAwaited.delete(tabKey(findWindow))) {
        focus.focusInWindow(findWindow, [
          { kind: "windowFind", key: findWindow },
        ]);
      }

      return;
    }

    const ownWindow = ownWindowOfFrame(frameName);

    if (ownWindow) {
      view.onFocus(() => {
        focus.noteFocused({ kind: "window", key: ownWindow });
      });
      ownWindows.adoptTitlebar(ownWindow, view);

      return;
    }

    if (frameName !== OVERLAY_FRAME_NAME) {
      view.close();

      return;
    }

    view.onFocus(() => {
      focus.noteFocused({ kind: "overlay" });
    });
    overlays.adopt(view);
  });
  shell.window.onPageFocus(() => {
    focus.noteFocused({ kind: "shell" });
  });
  shell.window.on("blur", () => {
    if (!staysOpenOutside(overlays.current())) {
      overlays.close();
    }
  });
  shell.window.onContentAreaResize(overlays.relayout);

  const {
    network,
    gmail,
    gmailHome,
    gmailOrigin,
    isGmailTab,
    inboxTypes,
    mail,
    pollProfiles,
    power,
  } = wireMailFeed({ apps, sessions, profiles, doNotDisturb });

  const systemBrowser = createSystemBrowser();
  const clipboard = systemClipboard();
  const preloads = new Map([
    ["gmail", path.join(import.meta.dirname, "preload-gmail.cjs")],
  ]);
  const views = createTabViews({
    sidebar: sidebar.current,
    window: shell.window,
    ownWindows,
    apps,
    signInOrigins,
    background,
    systemBrowser,
    network,
    senders,
    state: profiles.get,
    inboxOpen: () => overlays.current()?.kind === "inbox",
    openTab: profiles.openTab,
    selectTab: profiles.selectTab,
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
      focus.frontFocused();
    },
    onOwnWindowFocus: (key) => {
      focus.noteFocused({ kind: "window", key });
    },
    // Its bar stays behind: the search ends and the page is cleared.
    onMoved: (key) => {
      // oxlint-disable-next-line no-use-before-define -- no tab moves before startup ends
      find.moved(key);
    },
    onStrayFocus: focus.giveBack,
    // At launch and after a switch, typing reaches the page without a click;
    // with no tab open, the shell, whose New tab is what there is to do.
    onFront: () => {
      focus.focus([{ kind: "front" }, { kind: "shell" }]);
    },
    // Gmail puts the count in its title, so the badge follows the page.
    onPageChange: (key) => {
      if (isGmailTab(key)) {
        mail.pokeForPage(key.profileId);
      }
    },
    onLoaded: (key, page) => {
      void inboxTypes.loaded(key, page);
      // oxlint-disable-next-line no-use-before-define -- no page loads before the find bar exists
      find.loaded(key);
    },
    onNavigated: (key, inPage) => {
      // oxlint-disable-next-line no-use-before-define -- no page navigates before the find bar exists
      find.navigated(key, inPage);
    },
    onFound: (key, result) => {
      // oxlint-disable-next-line no-use-before-define -- no page answers before the find bar exists
      find.found(key, result);
    },
    log: console.error,
  });

  /**
   * Brings a tab's own window forward with keys going to its page, as Move
   * to New Window and a click on its tab do. Focusing a page activates the
   * app, so only where it is in front or can never be activated.
   */
  const showOwnWindow = (key: TabKey) => {
    ownWindows.reveal(key);

    if (!background || isTestBackground) {
      focus.focusInWindow(key, inOwnWindow(key));
    }
  };

  /**
   * Brings forward the window that shows the profile's Gmail, a message
   * just opened in it: its own window, or the main one.
   */
  const revealGmail = (profileId: string) => {
    const own = gmailOwnWindow(profiles.get(), profileId);

    if (own) {
      showOwnWindow(own);
    } else {
      revealWindow(shell.window, background);
    }
  };

  /** Tabs in their own windows whose find bar's view, still to come, takes focus. */
  const barsAwaited = new Set<string>();

  const find = createFind({
    pages: views,
    overlays,
    focus,
    windows: {
      focusBar: (key) => {
        if (ownWindows.findFocuser(key)) {
          focus.focusInWindow(key, [{ kind: "windowFind", key }]);
        } else {
          barsAwaited.add(tabKey(key));
        }
      },
      focusPage: (key) => {
        barsAwaited.delete(tabKey(key));
        focus.focusInWindow(key, [{ kind: "window", key }]);
      },
    },
  });

  overlays.onChange(find.follow);
  views.onChange(find.follow);

  // The find bar sits on its pane, which moves with the split; the views
  // also change on every page event, which must not move it.
  let panesLaidOut = views.panes();

  views.onChange(() => {
    const panes = views.panes();

    if (!isEqual(panes, panesLaidOut)) {
      panesLaidOut = panes;
      overlays.relayout();
    }
  });

  const { showGmail, navigateGmail, mailActions, inbox } = wireGmail({
    lifecycle,
    sessions,
    power,
    senders,
    settings,
    profiles,
    views,
    overlays,
    focus,
    mail,
    gmail,
    gmailHome,
    gmailOrigin,
    showOwnWindow,
    revealGmail,
  });

  const { livePageUrl, openApp, bookmarks } = wireLauncher({
    apps,
    shell,
    sidebar,
    profiles,
    views,
    overlays,
    showOwnWindow,
  });

  if (gmail && mailActions) {
    const mailNotifications = createMailNotifications({
      notifier: systemNotifier(),
      clipboard,
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
        revealGmail(profileId);
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
  profiles.onChange(inbox.follow);
  profiles.onChange(views.reconcile);
  // After the views, so focus handed back finds the new front tab's.
  profiles.onChange(overlays.follow);

  wireKeepAlive({
    apps,
    lifecycle,
    sessions,
    network,
    profiles,
    views,
    mail,
    keepAliveUrl,
    keepAliveTiming,
  });
  sidebar.onChange(views.relayout);
  sidebar.onChange(overlays.relayout);

  const { menu, moveToOwnWindow, moveToMainWindow } = wireMenu({
    platform,
    background,
    lifecycle,
    shell,
    shellDocumentIds,
    profiles,
    views,
    overlays,
    focus,
    find,
    sidebar,
    inbox,
    doNotDisturb,
    openApp,
    bookmarks,
    navigateGmail,
    showOwnWindow,
  });

  wireShellContract({
    platform,
    apps,
    ipc,
    senders,
    shellOrigin,
    shell,
    profiles,
    views,
    ownWindows,
    overlays,
    find,
    focus,
    sidebar,
    inbox,
    mail,
    doNotDisturb,
    openApp,
    bookmarks,
    menu,
    showGmail,
    showOwnWindow,
    moveToOwnWindow,
    moveToMainWindow,
    livePageUrl,
    clipboard,
    systemBrowser,
  });

  wireTray({
    platform,
    isMacOS,
    background,
    lifecycle,
    settings,
    theme,
    profiles,
    mail,
    shell,
    showGmail,
    revealGmail,
    doNotDisturb,
  });

  await shell.load();

  failures.markStarted();
};

// Not awaited: Electron holds its `ready` event until an ESM entry has finished
// evaluating, so a top-level await on `whenReady()` would never return.
start().catch(failures.report);
