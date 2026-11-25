import path from "node:path";

import { launchWindow } from "#core/launch-window.ts";
import { coversPage, overlayRectangle } from "#core/overlay.ts";
import { allowsPermission } from "#core/permissions.ts";
import { tabKey } from "#core/tabs.ts";
import { activateLanguage, resolveLanguage } from "#i18n/index.ts";
import { createAppLifecycle } from "#platform/app.ts";
import { createErrorDialog } from "#platform/dialog.ts";
import { createDisplays } from "#platform/displays.ts";
import { createIpc } from "#platform/ipc.ts";
import { createAppProtocol } from "#platform/protocol.ts";
import { createSystemBrowser } from "#platform/system-browser.ts";
import { createTheme } from "#platform/theme.ts";
import { createWindowFactory } from "#platform/window.ts";

import { createDeleteBrowsingData } from "./browsing-data.ts";
import { createFailures } from "./failures.ts";
import { createFocus } from "./focus.ts";
import { createOverlays } from "./overlay.ts";
import { createSenderRegistry } from "./senders.ts";
import { createShellWindow } from "./shell-window.ts";
import { createTabViews } from "./tab-views.ts";
import { followThemeSetting } from "./theme.ts";
import { wireContentBlocker } from "./wiring/content-blocker.ts";
import { wireDownloads } from "./wiring/downloads.ts";
import { wireFind } from "./wiring/find.ts";
import { wireGmail } from "./wiring/gmail.ts";
import { wireKeepAlive } from "./wiring/keep-alive.ts";
import { wireLauncher } from "./wiring/launcher.ts";
import { wireLinks } from "./wiring/links.ts";
import { wireMailFeed } from "./wiring/mail-feed.ts";
import { wireMenu } from "./wiring/menu.ts";
import { wireNotifications } from "./wiring/notifications.ts";
import { wireOwnWindows } from "./wiring/own-windows.ts";
import { wireSettingsWindow } from "./wiring/settings-window.ts";
import { wireShellContract } from "./wiring/shell-contract.ts";
import { wireShellDocuments } from "./wiring/shell-documents.ts";
import { wireShellRecovery } from "./wiring/shell-recovery.ts";
import { APP_SCHEME, resolveShell } from "./wiring/shell-source.ts";
import { wireStores } from "./wiring/stores.ts";
import {
  soundOutput,
  suiteRunsInBackground,
  systemClipboard,
  systemNotifier,
  testBuildSetup,
} from "./wiring/test-build.ts";
import { wireTray } from "./wiring/tray.ts";

const { apps, signInOrigins, keepAliveUrl, keepAliveTiming, contextMenus } =
  testBuildSetup();

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

  const {
    platform,
    isMacOS,
    sessions,
    profiles,
    sidebar,
    doNotDisturb,
    settings,
  } = await wireStores({ lifecycle, newId });

  const shellUrl = new URL(shellSource.url);

  shellUrl.searchParams.set("lang", language);

  const settingsUrl = new URL(shellSource.settingsUrl);

  settingsUrl.searchParams.set("lang", language);

  // Built by hand: URL's `origin` is "null" for a scheme it does not know.
  const shellOrigin = `${shellUrl.protocol}//${shellUrl.host}`;
  const settingsOrigin = `${settingsUrl.protocol}//${settingsUrl.host}`;
  const ipc = createIpc();

  const theme = createTheme();

  followThemeSetting({ theme, settings });

  const displays = createDisplays();
  const shell = createShellWindow({
    atLaunch: launchWindow({
      openInBackground: settings.get("openInBackground"),
      platform,
      trayShown: settings.get("tray"),
    }),
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
  wireShellRecovery({ lifecycle, errorDialog, shell });

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
        case "windowCard": {
          // oxlint-disable-next-line no-use-before-define -- resolved as focus moves, once both exist
          const shown = downloads.window();

          return shown && tabKey(shown) === tabKey(target.key)
            ? // oxlint-disable-next-line no-use-before-define -- resolved as focus moves, once both exist
              ownWindows.cardFocuser(target.key)
            : undefined;
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
        platform,
        overlay,
        overlay.kind === "find"
          ? // oxlint-disable-next-line no-use-before-define -- placed as the overlay opens, once both exist
            views.panes()?.find((pane) => pane.tabId === overlay.tabId)
          : undefined
      ),
    log: console.error,
  });

  const { ownWindows, showOwnWindow, revealGmail } = wireOwnWindows({
    apps,
    isMacOS,
    background,
    isTestBackground,
    lifecycle,
    contextMenus,
    displays,
    theme,
    shell,
    profiles,
    focus,
  });

  // One for every kind, so the suite's build captures them in one list.
  const notifier = systemNotifier();
  const {
    downloads,
    files: downloadFiles,
    watch: watchDownloads,
  } = wireDownloads({
    platform,
    isMacOS,
    background,
    shell,
    profiles,
    settings,
    overlays,
    ownWindows,
    focus,
    notifier,
    newId,
  });

  const { shellDocumentIds, barsAwaited } = wireShellDocuments({
    shell,
    senders,
    focus,
    overlays,
    ownWindows,
    // oxlint-disable-next-line no-use-before-define -- no key reaches a document before the menu exists
    handleKey: (input) => menu.handleKey(input),
  });

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
  const contentBlocker = wireContentBlocker({ settings, signInOrigins });
  const clipboard = systemClipboard();
  // A page's links leave through it; Meru's own, as Open in Browser, do not.
  const { linkOpener } = wireLinks({ settings, systemBrowser, clipboard });
  const preloads = new Map([
    ["gmail", path.join(import.meta.dirname, "preload-gmail.cjs")],
  ]);
  // A new profile is selected, so an open unified inbox would stand over it;
  // a page's Add another account and Settings' Add profile both close it.
  const addProfile = async () => {
    const profileId = await profiles.add();

    // oxlint-disable-next-line no-use-before-define -- no profile is added before the inbox exists
    inbox.setOpen(false);

    return profileId;
  };
  const views = createTabViews({
    sidebar: sidebar.current,
    platform,
    window: shell.window,
    ownWindows,
    apps,
    signInOrigins,
    background,
    systemBrowser: linkOpener,
    network,
    senders,
    state: profiles.get,
    openTab: profiles.openTab,
    selectTab: profiles.selectTab,
    closeTab: profiles.closeTab,
    newId,
    addProfile,
    // No key reaches a view before the menu below exists, as nothing between
    // them awaits.
    // oxlint-disable-next-line no-use-before-define -- the menu runs the views' commands
    handleKey: (input) => menu.handleKey(input),
    preloadFor: (app) => preloads.get(app),
    prepareSession: (partition) => {
      sessions.guard(partition, (ask) => allowsPermission(apps, ask));
      contentBlocker.prepare(partition);
      watchDownloads(partition, (webContentsId) => {
        // oxlint-disable-next-line no-use-before-define -- no download starts before a view exists
        views.closeIfOnlyDownloading(webContentsId);
      });
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

  const find = wireFind({ views, overlays, focus, ownWindows, barsAwaited });

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
    platform,
    apps,
    shell,
    sidebar,
    profiles,
    views,
    overlays,
    showOwnWindow,
  });

  // One for both, since the suite's build captures what the last one made.
  const sound = soundOutput({
    ipc,
    shellId: shell.window.webContentsId,
    shellOrigin,
    background,
    log: console.error,
  });

  const { showTestNotification } = wireNotifications({
    isMacOS,
    sound,
    settings,
    profiles,
    mail,
    gmail,
    mailActions,
    showGmail,
    revealGmail,
    clipboard,
    notifier,
  });

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
    contentBlocker,
    network,
    profiles,
    views,
    mail,
    keepAliveUrl,
    keepAliveTiming,
  });
  sidebar.onChange(views.relayout);
  sidebar.onChange(overlays.relayout);

  const {
    openSettings,
    settingsFocused,
    onSettingsFocusChange,
    settingsPages,
  } = wireSettingsWindow({
    platform,
    downloadFiles,
    isMacOS,
    background,
    lifecycle,
    contextMenus,
    displays,
    theme,
    url: settingsUrl.href,
    origin: settingsOrigin,
    ipc,
    senders,
    settings,
    profiles,
    addProfile,
    mail,
    doNotDisturb,
    sound,
    showTestNotification,
    deleteBrowsingData: createDeleteBrowsingData({ sessions, views, mail }),
    // Google's sign-in is in the profile's Gmail tab, so the window comes
    // forward with it, unless the background flags hold it back.
    signIn: async (profileId) => {
      await showGmail.jumpTo(profileId);
      revealGmail(profileId);
    },
  });

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
    downloads,
    doNotDisturb,
    openApp,
    bookmarks,
    navigateGmail,
    showOwnWindow,
    openSettings,
    settingsFocused,
    onSettingsFocusChange,
    settingsPages,
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
    downloads,
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
    settings,
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
