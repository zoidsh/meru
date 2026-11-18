import path from "node:path";

import { isEqual } from "es-toolkit";

import {
  OVERLAY_FRAME_NAME,
  coversPage,
  overlayRectangle,
  staysOpenOutside,
} from "#core/overlay.ts";
import { ownWindowFindOfFrame, ownWindowOfFrame } from "#core/own-window.ts";
import { allowsPermission } from "#core/permissions.ts";
import { tabKey } from "#core/tabs.ts";
import { activateLanguage, resolveLanguage } from "#i18n/index.ts";
import { createAppLifecycle } from "#platform/app.ts";
import { createDevServerPolicy } from "#platform/dev-server.ts";
import { createErrorDialog } from "#platform/dialog.ts";
import { createDisplays } from "#platform/displays.ts";
import { createIpc } from "#platform/ipc.ts";
import { createAppProtocol } from "#platform/protocol.ts";
import { createSystemBrowser } from "#platform/system-browser.ts";
import { createTheme } from "#platform/theme.ts";
import { createWindowFactory } from "#platform/window.ts";

import { createContentSecurityPolicy } from "./content-security-policy.ts";
import { createDevContentSecurityPolicy, readDevServer } from "./dev-server.ts";
import { createFailures } from "./failures.ts";
import { createFind } from "./find.ts";
import { createFocus } from "./focus.ts";
import { createOverlays } from "./overlay.ts";
import { createSenderRegistry } from "./senders.ts";
import { createShellWindow } from "./shell-window.ts";
import { createTabViews } from "./tab-views.ts";
import { wireGmail } from "./wiring/gmail.ts";
import { wireKeepAlive } from "./wiring/keep-alive.ts";
import { wireLauncher } from "./wiring/launcher.ts";
import { wireMailFeed } from "./wiring/mail-feed.ts";
import { wireMenu } from "./wiring/menu.ts";
import { wireNotifications } from "./wiring/notifications.ts";
import { wireOwnWindows } from "./wiring/own-windows.ts";
import { wireShellContract } from "./wiring/shell-contract.ts";
import { wireStores } from "./wiring/stores.ts";
import {
  suiteRunsInBackground,
  systemClipboard,
  testBuildSetup,
} from "./wiring/test-build.ts";
import { wireTray } from "./wiring/tray.ts";

const APP_SCHEME = "meru-app";

const SHELL_HOST = "shell";

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

  wireNotifications({
    isMacOS,
    background,
    ipc,
    shell,
    shellOrigin,
    settings,
    profiles,
    mail,
    gmail,
    mailActions,
    showGmail,
    revealGmail,
    clipboard,
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
