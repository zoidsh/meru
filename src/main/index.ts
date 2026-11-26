import path from "node:path";

import { pick } from "es-toolkit";

import { SHELL_ENTITLEMENT_CALL_NAMES } from "#contract/entitlement-channels.ts";
import { entitledApps } from "#core/apps.ts";
import { launchWindow } from "#core/launch-window.ts";
import { coversPage, overlayRectangle } from "#core/overlay.ts";
import { allowsPermission } from "#core/permissions.ts";
import type { Platform } from "#core/platform.ts";
import {
  activateLanguage,
  AVAILABLE_LANGUAGES,
  resolveLanguage,
} from "#i18n/index.ts";
import { createAppLifecycle } from "#platform/app.ts";
import { createErrorDialog } from "#platform/dialog.ts";
import { createDisplays } from "#platform/displays.ts";
import { createIpc } from "#platform/ipc.ts";
import { setApplicationMenu } from "#platform/menu.ts";
import { createAppProtocol } from "#platform/protocol.ts";
import { createSpellChecker } from "#platform/spellcheck.ts";
import { createSystemBrowser } from "#platform/system-browser.ts";
import { createSystemInfo } from "#platform/system-info.ts";
import { createTextFile } from "#platform/text-file.ts";
import { createTheme } from "#platform/theme.ts";
import { createWindowFactory } from "#platform/window.ts";

import { buildLaunchMenuTemplate } from "./application-menu.ts";
import { createDeleteBrowsingData } from "./browsing-data.ts";
import { entitlementHandlers } from "./entitlement-handlers.ts";
import { createFailures } from "./failures.ts";
import { createFocus } from "./focus.ts";
import { createLanguage } from "./language.ts";
import { createOverlays } from "./overlay.ts";
import { createSenderRegistry } from "./senders.ts";
import { SETTINGS_FILE_NAME } from "./settings.ts";
import { createShellSource, serveShellContract } from "./shell-ipc.ts";
import {
  createTrialChoice,
  followLicenseNotice,
  readShellPro,
  showsTrialFooter,
} from "./shell-pro.ts";
import { createShellWindow } from "./shell-window.ts";
import { createSpellcheck } from "./spellcheck.ts";
import { createTabViews } from "./tab-views.ts";
import { followThemeSetting } from "./theme.ts";
import { revealWindow } from "./windows.ts";
import { wireAddProfile } from "./wiring/add-profile.ts";
import { wireContentBlocker } from "./wiring/content-blocker.ts";
import { wireDownloads } from "./wiring/downloads.ts";
import {
  answerEmailLinks,
  receiveEmailLinks,
  registerAsMailApp,
} from "./wiring/email-links.ts";
import { wireFind } from "./wiring/find.ts";
import { wireGmail } from "./wiring/gmail.ts";
import { wireHardwareAcceleration } from "./wiring/hardware-acceleration.ts";
import { wireIdleSleep } from "./wiring/idle-sleep.ts";
import { wireKeepAlive } from "./wiring/keep-alive.ts";
import { wireLauncher } from "./wiring/launcher.ts";
import { wireLinks } from "./wiring/links.ts";
import { wireMailFeed } from "./wiring/mail-feed.ts";
import { wireMenu } from "./wiring/menu.ts";
import { wireNotifications } from "./wiring/notifications.ts";
import { wireOwnWindows } from "./wiring/own-windows.ts";
import { wireScreenPicker } from "./wiring/screen-picker.ts";
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
import { wireUpdateCard } from "./wiring/update-card.ts";
import { wireUpdates } from "./wiring/updates.ts";

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

  // Before `ready`, so the link that launches Meru is heard.
  const emailLinks = receiveEmailLinks(lifecycle);

  // Guards a GNOME crash in GTK 4.
  if (process.platform === "linux") {
    lifecycle.appendSwitch("gtk-version", "3");
  }

  if (process.platform === "win32") {
    lifecycle.setAppUserModelId(MERU_APP_ID);
  }

  // Synchronous and before the first await, so it is done before `ready`.
  const hardwareAccelerationAtLaunch = wireHardwareAcceleration({
    settingsFile: createTextFile(
      path.join(lifecycle.userDataPath, SETTINGS_FILE_NAME)
    ),
    lifecycle,
    platform: process.platform as Platform,
  });

  const appProtocol = createAppProtocol();

  appProtocol.registerPrivilegedScheme(APP_SCHEME);

  await lifecycle.whenReady();

  shellSource.apply(appProtocol);

  // Until the settings say otherwise, for whatever the stores tell first.
  activateLanguage(resolveLanguage(lifecycle.preferredLanguages()));

  const clipboard = systemClipboard();
  const {
    platform,
    isMacOS,
    sessions,
    profiles,
    sidebar,
    doNotDisturb,
    settings,
    settingsFile,
    entitlement,
    licenseRequests,
    firstRefresh,
    storesSettled,
  } = await wireStores({ lifecycle, newId, clipboard });

  // Decided once, from the entitlement read at launch.
  const trialChoice = createTrialChoice({ entitlement });

  // Before anything that shows a string, as the entitlement's launch prompt.
  const language = createLanguage({
    settings,
    available: AVAILABLE_LANGUAGES,
    preferredLanguages: lifecycle.preferredLanguages,
    activate: activateLanguage,
  });

  // A renderer's first paint is in the language it is loaded with; a change
  // after reaches it through its contract.
  const shellUrl = new URL(shellSource.url);

  shellUrl.searchParams.set("lang", language.current());

  const settingsUrl = new URL(shellSource.settingsUrl);
  const settingsUrlNow = () => {
    settingsUrl.searchParams.set("lang", language.current());

    return settingsUrl.href;
  };

  // Built by hand: URL's `origin` is "null" for a scheme it does not know.
  const shellOrigin = `${shellUrl.protocol}//${shellUrl.host}`;
  const settingsOrigin = `${settingsUrl.protocol}//${settingsUrl.host}`;
  const ipc = createIpc();

  const theme = createTheme();

  followThemeSetting({ theme, settings });

  const displays = createDisplays();
  const shell = createShellWindow({
    // The trial-ended screen shows whatever Open in the background says:
    // until the person chooses, no tray or Dock item of Meru's can bring it.
    atLaunch: trialChoice.waiting()
      ? "shown"
      : launchWindow({
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

  // A page's links leave through the opener, which asks first; Meru's own, as
  // Open in Browser, through `systemBrowser`, which asks nothing. Both show
  // the default-browser alert while Meru is the default browser.
  const {
    linkOpener,
    ownLinks: systemBrowser,
    trustedSites,
  } = wireLinks({
    platform,
    settings,
    systemBrowser: createSystemBrowser(),
    clipboard,
  });
  const launchHandlers = pick(
    entitlementHandlers({ entitlement, licenseRequests, systemBrowser }),
    SHELL_ENTITLEMENT_CALL_NAMES
  );
  const pro = () =>
    readShellPro({ entitlement, licenseRequests, trialChoice, profiles });
  // Not the profiles, which the app's shell state follows already.
  const onProChange = (listener: () => void) => {
    entitlement.onChange(listener);
    licenseRequests.onChange(listener);
  };
  // Served from the first paint, so the trial-ended screen can draw before
  // anything of a profile exists. The screen stays until the app's state
  // takes over, so the shell opens nothing of the app before main listens.
  const shellContract = createShellSource({
    handlers: launchHandlers,
    state: {
      read: () => ({
        language: language.current(),
        pro: { ...pro(), trialChoice: true },
      }),
      onChange: (listener) => {
        const stops = [
          language.onChange(listener),
          entitlement.onChange(listener),
          licenseRequests.onChange(listener),
        ];

        return () => {
          for (const stop of stops) {
            stop();
          }
        };
      },
    },
  });

  serveShellContract({
    ipc,
    senders,
    shellOrigin,
    ...shellContract,
    log: console.error,
  });

  let shellLoaded = false;

  if (trialChoice.waiting()) {
    // Nothing of a profile runs until the person chooses: no view, session,
    // mail check, notification, tray or unified inbox, and no command that
    // would reach one.
    setApplicationMenu(
      buildLaunchMenuTemplate({ platform, appName: lifecycle.name })
    );

    const reveal = () => {
      if (trialChoice.waiting()) {
        revealWindow(shell.window, background);
      }
    };

    lifecycle.onActivate(reveal);
    lifecycle.onSecondInstance(reveal);
    await shell.load();
    shellLoaded = true;

    if (!background) {
      shell.window.focusPage();
    }

    await trialChoice.chosen;
  }

  const frame = () => ({
    sidebar: sidebar.current(),
    trialFooter: showsTrialFooter(entitlement),
  });

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
          return hasWindowCard(target.key)
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
        frame(),
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
    storesSettled,
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

  const contentBlocker = wireContentBlocker({ settings, signInOrigins });
  // macOS checks spelling with its own, whatever a session is given.
  const spellcheck = isMacOS
    ? undefined
    : createSpellcheck({
        checker: createSpellChecker(),
        settings,
        log: console.error,
      });
  const preloads = new Map([
    ["gmail", path.join(import.meta.dirname, "preload-gmail.cjs")],
  ]);
  const { addProfile, addProfileFromPage } = wireAddProfile({
    profiles,
    entitlement,
    overlays,
    // oxlint-disable-next-line no-use-before-define -- no profile is added before the inbox exists
    closeInbox: () => inbox.setOpen(false),
  });
  // Read at each link and each pick, for the profile it opens in, so a
  // change applies to the next one.
  const appOpening = (profileId: string) => ({
    openAppsInMeru: settings.get("openAppsInMeru", profileId),
    appsInDefaultBrowser: settings.get("appsInDefaultBrowser", profileId),
  });
  const prepareSession = (partition: string) => {
    sessions.guard(partition, (ask) => allowsPermission(apps, ask));
    contentBlocker.prepare(partition);
    spellcheck?.prepare(partition);
    watchDownloads(partition, (webContentsId) => {
      // oxlint-disable-next-line no-use-before-define -- no download starts before a view exists
      views.closeIfOnlyDownloading(webContentsId);
    });
  };
  const views = createTabViews({
    frame,
    platform,
    window: shell.window,
    ownWindows,
    apps,
    tabApps: () => entitledApps(apps, entitlement.can("workspaceApps")),
    appOpening,
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
    addProfile: addProfileFromPage,
    // No key reaches a view before the menu below exists, as nothing between
    // them awaits.
    // oxlint-disable-next-line no-use-before-define -- the menu runs the views' commands
    handleKey: (input) => menu.handleKey(input),
    preloadFor: (app) => preloads.get(app),
    prepareSession,
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

      if (!inPage) {
        // oxlint-disable-next-line no-use-before-define -- no page navigates before the picker exists
        screenPicker.navigated(key);
      }
    },
    onFound: (key, result) => {
      // oxlint-disable-next-line no-use-before-define -- no page answers before the find bar exists
      find.found(key, result);
    },
    log: console.error,
  });

  const find = wireFind({ views, overlays, focus, ownWindows, barsAwaited });

  const { screenPicker, hasWindowCard } = wireScreenPicker({
    platform,
    apps,
    sessions,
    senders,
    profiles,
    views,
    ownWindows,
    overlays,
    downloads,
    focus,
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
    entitlement,
  });

  const { livePageUrl, openApp, bookmarks } = wireLauncher({
    platform,
    apps,
    appOpening,
    systemBrowser: linkOpener,
    shell,
    frame,
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
  wireIdleSleep({ lifecycle, settings, profiles, views, power });
  sidebar.onChange(views.relayout);
  sidebar.onChange(overlays.relayout);
  // The trial footer, coming or going, moves the pages as the sidebar does.
  entitlement.onChange(views.relayout);
  entitlement.onChange(overlays.relayout);

  const updates = await wireUpdates({
    lifecycle,
    settings,
    runningVersion: createSystemInfo().appVersion(),
    systemBrowser,
  });

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
    url: settingsUrlNow,
    origin: settingsOrigin,
    language,
    spellcheck,
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
    hardwareAccelerationAtLaunch,
    settingsFile,
    trustedSites,
    entitlement,
    licenseRequests,
    systemBrowser,
    clipboard,
    updates,
    // Google's sign-in is in the profile's Gmail tab, so the window comes
    // forward with it, unless the background flags hold it back.
    signIn: async (profileId) => {
      await showGmail.jumpTo(profileId);
      revealGmail(profileId);
    },
  });

  const { menu, moveToOwnWindow, moveToMainWindow } = wireMenu({
    platform,
    language,
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
    entitlement,
    canUpdate: () => updates.read().status !== "unsupported",
    checkForUpdates: () => {
      openSettings();
      settingsPages.open({ section: "about", profileId: null });
      updates.check();
    },
  });

  const updateCard = wireUpdateCard({
    updates,
    overlays,
    log: console.error,
  });

  wireShellContract({
    platform,
    language,
    apps,
    shellContract,
    launchHandlers,
    pro,
    onProChange,
    trialFooter: () => showsTrialFooter(entitlement),
    shell,
    profiles,
    views,
    ownWindows,
    overlays,
    find,
    updateCard,
    focus,
    sidebar,
    inbox,
    downloads,
    screenPicker,
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
    can: entitlement.can,
  });

  wireTray({
    platform,
    language,
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

  followLicenseNotice({
    entitlement,
    overlays,
    window: shell.window,
    windowActive: focus.windowActive,
    firstRefresh,
  });

  // Loaded already for the trial-ended screen, which then gave way.
  if (!shellLoaded) {
    await shell.load();
  }

  void registerAsMailApp(platform, lifecycle.userDataPath);
  answerEmailLinks({
    incoming: emailLinks,
    background,
    shell,
    profiles,
    entitlement,
    overlays,
    views,
    senders,
    prepareSession,
    gmailHome,
  });

  updates.start();

  failures.markStarted();
};

// Not awaited: Electron holds its `ready` event until an ESM entry has finished
// evaluating, so a top-level await on `whenReady()` would never return.
start().catch(failures.report);
