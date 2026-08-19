import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import { platform } from "@electron-toolkit/utils";
import { MAX_RECENT_DOWNLOAD_HISTORY_ITEMS } from "@meru/shared/constants";
import { isCuratedExtensionId } from "@meru/shared/extensions";
import { getWorkspaceAppUrl } from "@meru/shared/google";
import { ms } from "@meru/shared/ms";
import { GMAIL_TAB_ID } from "@meru/shared/tabs";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";
import { workspaceApps } from "@meru/shared/workspace-apps";
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  nativeTheme,
  session,
  shell,
} from "electron";
import { machineId } from "node-machine-id";
import { serializeError } from "serialize-error";
import { accounts } from "@/accounts";
import { bookmarks } from "@/bookmarks";
import { config } from "@/config";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appMenu } from "@/menu";
import { DormantTab } from "@/tabs";
import {
  canOpenWorkspaceAppInApp,
  resolveWorkspaceAppOpenBehavior,
  WorkspaceApp,
} from "@/workspace-app";
import { confirmAppLinksTabHandover } from "./dialogs";
import { DoNotDisturb, doNotDisturb } from "./do-not-disturb";
import { downloads } from "./downloads";
import { extensionActions } from "./extension-actions";
import {
  extensionUpdater,
  getInstalledExtensions,
  installCuratedExtension,
  uninstallCuratedExtension,
} from "./extensions";
import { GMAIL_USER_STYLES_PATH } from "./gmail";
import { log } from "./lib/log";
import {
  areWorkspaceAppNotificationsAllowed,
  createNewEmailNotification,
  createNotification,
} from "./notifications";
import { MAILTO_PROTOCOL } from "./protocol";
import { appUpdater } from "./updater";
import { openExternalUrl } from "./url";

const undoSendLapseTimeouts = new Map<number, NodeJS.Timeout>();

function clearUndoSendLapseTimeout(browserWindowId: number) {
  const undoSendLapseTimeout = undoSendLapseTimeouts.get(browserWindowId);

  if (undoSendLapseTimeout) {
    clearTimeout(undoSendLapseTimeout);
  }

  undoSendLapseTimeouts.delete(browserWindowId);
}

function getNavigationWebContents(workspaceAppId?: string) {
  if (workspaceAppId) {
    return WorkspaceApp.fromId(workspaceAppId).view.webContents;
  }

  const selectedAccount = accounts.getSelectedAccount();

  return (selectedAccount.instance.tabs.activeTab.view ?? selectedAccount.instance.gmail.view)
    .webContents;
}

class Ipc {
  main = new IpcListener<IpcMainEvents>();

  renderer = new IpcEmitter<IpcRendererEvent>();

  init() {
    config.onDidAnyChange(() => {
      ipc.renderer.send(main.window.webContents, "config.configChanged", config.store);

      const recentDownloadHistoryPopupWebContents =
        downloads.recentDownloadHistoryPopup.webContents;

      if (recentDownloadHistoryPopupWebContents) {
        ipc.renderer.send(
          recentDownloadHistoryPopupWebContents,
          "config.configChanged",
          config.store,
        );
      }

      for (const workspaceAppWindow of WorkspaceApp.getAllWindows()) {
        ipc.renderer.send(workspaceAppWindow.webContents, "config.configChanged", config.store);
      }
    });

    config.onDidChange("accounts", () => {
      accounts.sendAccountsChangedToRenderer();

      // Bookmarks live in the account config, so every surface reflecting them
      // redraws from here rather than from a change event of its own. The strip's
      // tab rows star the URL they sit on, so they are sent again too.
      accounts.sendTabsChangedToRenderer();

      bookmarks.sendChangedToPopup();

      WorkspaceApp.broadcastBookmarkStates();
    });

    this.main.on("accounts.selectAccount", (_event, selectedAccountId) => {
      accounts.selectAccount(selectedAccountId);
    });

    this.main.on("accounts.selectPreviousAccount", () => {
      accounts.selectPreviousAccount();
    });

    this.main.on("accounts.selectNextAccount", () => {
      accounts.selectNextAccount();
    });

    this.main.on("accounts.addAccount", (_event, accountDetails) => {
      accounts.addAccount(accountDetails);
    });

    this.main.on("accounts.removeAccount", (_event, selectedAccountId) => {
      accounts.removeAccount(selectedAccountId);
    });

    this.main.on("accounts.updateAccount", (_event, updatedAccount) => {
      accounts.updateAccount(updatedAccount);
    });

    this.main.on("workspaceApp.goBack", (_event, workspaceAppId) => {
      getNavigationWebContents(workspaceAppId).navigationHistory.goBack();
    });

    this.main.on("workspaceApp.goForward", (_event, workspaceAppId) => {
      getNavigationWebContents(workspaceAppId).navigationHistory.goForward();
    });

    this.main.on("workspaceApp.reload", (_event, workspaceAppId) => {
      getNavigationWebContents(workspaceAppId).reload();
    });

    this.main.on("workspaceApp.stop", (_event, workspaceAppId) => {
      getNavigationWebContents(workspaceAppId).stop();
    });

    this.main.handle("workspaceApp.getLoadingState", (_event, workspaceAppId) => {
      return getNavigationWebContents(workspaceAppId).isLoading();
    });

    this.main.on("gmail.setOutOfOffice", (event, outOfOffice) => {
      const accountInstance = accounts.findInstanceByGmailWebContentsId(event.sender.id);

      if (accountInstance) {
        accountInstance.gmail.store.setState({
          outOfOffice,
        });
      }
    });

    this.main.on("titleBar.toggleAppMenu", () => {
      appMenu.togglePopup();
    });

    this.main.handle("licenseKey.activate", (_event, input) =>
      licenseKey.activate({ licenseKey: input }),
    );

    this.main.handle("desktopSources.getSources", async () => {
      const desktopSources = await desktopCapturer.getSources({
        types: ["screen", "window"],
      });

      return desktopSources
        .filter((source) => !source.name.startsWith("Choose what to share"))
        .map(({ id, name, thumbnail }) => ({
          id,
          name,
          thumbnail: thumbnail.toDataURL(),
        }));
    });

    this.main.on("findInPage", (event, text, options) => {
      const targetWebContents =
        WorkspaceApp.tryFromWebContents(event.sender)?.view.webContents ??
        getNavigationWebContents();

      if (!text) {
        targetWebContents.stopFindInPage("clearSelection");

        return;
      }

      targetWebContents.findInPage(text, {
        forward: options?.forward,
        findNext: options?.findNext,
      });
    });

    ipc.main.on("downloads.openFile", async (_event, { id, filePath }) => {
      if (await downloads.markDownloadMissingIfGone(id, filePath)) {
        return;
      }

      shell.openPath(filePath);
    });

    ipc.main.on("downloads.showFileInFolder", async (_event, { id, filePath }) => {
      if (await downloads.markDownloadMissingIfGone(id, filePath)) {
        return;
      }

      shell.showItemInFolder(filePath);
    });

    ipc.main.on("taskbar.setOverlayIcon", (_event, dataUrl) => {
      main.window.setOverlayIcon(
        nativeImage.createFromDataURL(dataUrl),
        "You have unread messages",
      );
    });

    ipc.main.on("appUpdater.quitAndInstall", () => {
      appUpdater.quitAndInstall();
    });

    ipc.main.on("appUpdater.openVersionHistory", () => {
      main.navigate("/settings/version-history");
    });

    ipc.main.on("gmail.search", (_event, searchQuery) => {
      const selectedAccount = accounts.getSelectedAccount();

      selectedAccount.instance.gmail.search(searchQuery);
    });

    this.main.handle("workspaceApp.getBookmarkState", (_event, workspaceAppId) => {
      return WorkspaceApp.fromId(workspaceAppId).bookmarkState;
    });

    ipc.main.on("workspaceApp.toggleBookmark", (_event, workspaceAppId) => {
      WorkspaceApp.fromId(workspaceAppId).toggleBookmark();
    });

    ipc.main.on("workspaceApp.showMenu", (_event, workspaceAppId) => {
      const workspaceApp = WorkspaceApp.fromId(workspaceAppId);

      const isWindowsMode = config.get("workspaceApps.mode") === "windows";

      Menu.buildFromTemplate([
        ...(workspaceApp.isPopup || isWindowsMode
          ? []
          : [
              {
                label: "Move to Tab",
                click: () => {
                  workspaceApp.adoptIntoTabs();
                },
              },
              {
                type: "separator" as const,
              },
            ]),
        ...(workspaceApp.isSavable
          ? [
              {
                label: "Load on Launch",
                type: "checkbox" as const,
                checked: workspaceApp.pinned && workspaceApp.loadOnLaunch,
                click: () => {
                  if (workspaceApp.loadOnLaunch) {
                    workspaceApp.loadOnLaunch = false;

                    accounts.saveTabs();

                    return;
                  }

                  workspaceApp.loadOnLaunch = true;

                  workspaceApp.account.instance.tabs.setTabPinned(workspaceApp.id, true);
                },
              },
              {
                type: "separator" as const,
              },
            ]
          : []),
        {
          label: "Copy Link",
          click: () => {
            workspaceApp.copyUrl();
          },
        },
        {
          label: "Open in Default Browser",
          click: () => {
            workspaceApp.openInBrowser();
          },
        },
      ]).popup();
    });

    ipc.main.on("tabs.selectTab", (_event, accountId, tabId) => {
      const account = accounts.getAccount(accountId);

      const selectedTab = account.instance.tabs.getTab(tabId);

      account.instance.tabs.activateTab(tabId);

      if (selectedTab instanceof WorkspaceApp && selectedTab.isWindowed) {
        return;
      }

      if (account.config.selected) {
        accounts.refreshSelectedAccountView();
      } else {
        accounts.selectAccount(accountId);
      }
    });

    ipc.main.on("tabs.closeTab", (_event, accountId, tabId) => {
      const account = accounts.getAccount(accountId);

      account.instance.tabs.closeTab(tabId);

      if (account.config.selected) {
        accounts.refreshSelectedAccountView();
      }
    });

    ipc.main.on("tabs.moveTab", (_event, accountId, tabId, targetSectionIndex) => {
      const account = accounts.getAccount(accountId);

      account.instance.tabs.moveTab(tabId, targetSectionIndex);
    });

    ipc.main.on("tabs.showTabContextMenu", (_event, accountId, tabId) => {
      const account = accounts.getAccount(accountId);

      const tab = account.instance.tabs.getTab(tabId);

      if (!(tab instanceof WorkspaceApp) && !(tab instanceof DormantTab)) {
        return;
      }

      const tabApp = tab.app;

      // The designation stays visible and removable from the tab holding it.
      const appLinksApp = tab.opensLinksForApp ?? tabApp;

      const hasOtherClosableTabs = account.instance.tabs.tabs.some(
        (accountTab) =>
          accountTab.id !== tabId && accountTab.id !== GMAIL_TAB_ID && !accountTab.pinned,
      );

      const contextTabIndex = account.instance.tabs.tabs.findIndex(
        (accountTab) => accountTab.id === tabId,
      );

      const hasClosableTabsBelow = account.instance.tabs.tabs
        .slice(contextTabIndex + 1)
        .some((accountTab) => !accountTab.pinned);

      const isWindowsMode = config.get("workspaceApps.mode") === "windows";

      const openWorkspaceAppUrl = (url: string) => {
        account.instance.tabs.openUrl(url);

        if (account.config.selected) {
          accounts.refreshSelectedAccountView();
        }
      };

      Menu.buildFromTemplate([
        ...(tabApp && !workspaceApps[tabApp].singleInstance
          ? [
              {
                label: `New ${workspaceApps[tabApp].label} ${isWindowsMode ? "Window" : "Tab"}`,
                click: () => {
                  openWorkspaceAppUrl(getWorkspaceAppUrl(tabApp));
                },
              },
            ]
          : []),
        {
          label: "Reload",
          enabled: tab instanceof WorkspaceApp,
          click: () => {
            if (tab instanceof WorkspaceApp) {
              tab.reload();
            }
          },
        },
        {
          label: "Duplicate",
          click: () => {
            const currentTabUrl =
              tab instanceof WorkspaceApp ? tab.view.webContents.getURL() : tab.url;

            const duplicatedTabUrl =
              !currentTabUrl && tabApp ? getWorkspaceAppUrl(tabApp) : currentTabUrl;

            openWorkspaceAppUrl(duplicatedTabUrl);
          },
        },
        ...(tab instanceof WorkspaceApp && tab.isWindowed
          ? [
              {
                label: "Move to Tab",
                click: () => {
                  if (tab instanceof WorkspaceApp) {
                    tab.adoptIntoTabs();
                  }

                  if (account.config.selected) {
                    accounts.refreshSelectedAccountView();
                  }
                },
              },
            ]
          : [
              {
                label: "Move to New Window",
                enabled: tab instanceof WorkspaceApp && !tab.isWindowed,
                click: () => {
                  if (tab instanceof WorkspaceApp) {
                    tab.detachToWindow();
                  }

                  if (account.config.selected) {
                    accounts.refreshSelectedAccountView();
                  }
                },
              },
            ]),
        {
          type: "separator",
        },
        {
          label: "Copy Link",
          click: () => {
            if (tab instanceof WorkspaceApp) {
              tab.copyUrl();

              return;
            }

            clipboard.writeText(tab.url);
          },
        },
        {
          label: "Open in Default Browser",
          click: () => {
            if (tab instanceof WorkspaceApp) {
              tab.openInBrowser();

              return;
            }

            openExternalUrl(tab.url, { skipTrustedHostCheck: true });
          },
        },
        ...(tabApp
          ? [
              {
                type: "separator" as const,
              },
              {
                label: tab.pinned ? "Unpin" : "Pin",
                click: () => {
                  account.instance.tabs.setTabPinned(tabId, !tab.pinned);
                },
              },
              {
                label: bookmarks.isBookmarked(accountId, tab.url) ? "Remove Bookmark" : "Bookmark",
                click: () => {
                  bookmarks.toggle(accountId, {
                    app: tabApp,
                    url: tab.url,
                    title: tab.title,
                  });
                },
              },
              ...(tab.pinned
                ? [
                    {
                      label: "Load on Launch",
                      type: "checkbox" as const,
                      checked: tab.loadOnLaunch,
                      click: () => {
                        tab.loadOnLaunch = !tab.loadOnLaunch;

                        accounts.saveTabs();
                      },
                    },
                  ]
                : []),
              // While the setting is on Selected Tabs, only the tabs marked
              // here hibernate.
              ...(config.get("workspaceApps.hibernation") === "selected"
                ? [
                    {
                      label: "Hibernate When Idle",
                      type: "checkbox" as const,
                      checked: tab.hibernatesWhenIdle,
                      click: () => {
                        tab.hibernatesWhenIdle = !tab.hibernatesWhenIdle;

                        // An unpinned tab is not saved, so the mark lasts as
                        // long as the tab itself does.
                        if (tab.pinned) {
                          accounts.saveTabs();
                        }
                      },
                    },
                  ]
                : []),
            ]
          : []),
        ...(appLinksApp && !workspaceApps[appLinksApp].singleInstance
          ? [
              // A tab that browsed off Google has no app and so no menu group of
              // its own, but it can still be holding a designation from before —
              // which then needs a separator to sit under.
              ...(tabApp ? [] : [{ type: "separator" as const }]),
              {
                label: `Open ${workspaceApps[appLinksApp].label} Links in This ${
                  tab instanceof WorkspaceApp && tab.isWindowed ? "Window" : "Tab"
                }`,
                type: "checkbox" as const,
                checked: Boolean(tab.opensLinksForApp),
                click: async () => {
                  if (tab.opensLinksForApp) {
                    account.instance.tabs.setTabOpensLinksForApp(tabId, null);

                    return;
                  }

                  const appLinksTab = account.instance.tabs.getAppLinksTab(appLinksApp);

                  if (
                    appLinksTab &&
                    !(await confirmAppLinksTabHandover(appLinksApp, appLinksTab.title))
                  ) {
                    return;
                  }

                  account.instance.tabs.setTabOpensLinksForApp(tabId, appLinksApp);
                },
              },
            ]
          : []),
        {
          type: "separator",
        },
        ...(tab instanceof DormantTab
          ? [
              {
                label: "Open",
                click: () => {
                  account.instance.tabs.activateTab(tabId);

                  if (account.config.selected) {
                    accounts.refreshSelectedAccountView();
                  }
                },
              },
            ]
          : []),
        // An unloaded pinned tab is the one thing with nothing left to close:
        // it is already saved, and closing it again would drop what was pinned.
        ...(tab instanceof DormantTab && tab.pinned
          ? []
          : [
              {
                label: "Close",
                click: () => {
                  account.instance.tabs.closeTab(tabId);

                  if (account.config.selected) {
                    accounts.refreshSelectedAccountView();
                  }
                },
              },
            ]),
        {
          label: "Close Other Tabs",
          enabled: hasOtherClosableTabs,
          click: () => {
            account.instance.tabs.closeOtherTabs(tabId);

            if (account.config.selected) {
              accounts.refreshSelectedAccountView();
            }
          },
        },
        {
          label: "Close Tabs Below",
          enabled: hasClosableTabsBelow,
          click: () => {
            account.instance.tabs.closeTabsBelow(tabId);

            if (account.config.selected) {
              accounts.refreshSelectedAccountView();
            }
          },
        },
      ]).popup();
    });

    ipc.main.on("tabs.showVerticalTabsContextMenu", (_event, accountId) => {
      const account = accounts.getAccount(accountId);

      Menu.buildFromTemplate([
        {
          label: "Reopen Closed Tab",
          enabled: account.instance.tabs.hasRecentlyClosedTabs,
          click: () => {
            if (account.instance.tabs.reopenClosedTab() && account.config.selected) {
              accounts.refreshSelectedAccountView();
            }
          },
        },
        {
          type: "separator",
        },
        // The way back from a width set by the button, which is otherwise the
        // Width setting's to give — and there is nothing to reset to on `auto`,
        // where picking it again in settings changes nothing.
        {
          label: "Reset Width",
          enabled: Boolean(account.instance.verticalTabsWidth),
          click: () => {
            accounts.setVerticalTabsWidth(accountId, null);
          },
        },
      ]).popup();
    });

    ipc.main.on("tabs.setVerticalTabsWidth", (_event, accountId, width) => {
      accounts.setVerticalTabsWidth(accountId, width);
    });

    ipc.main.handle("config.getConfig", () => config.store);

    ipc.main.handle(
      "spellchecker.getAvailableLanguages",
      () => session.defaultSession.availableSpellCheckerLanguages,
    );

    ipc.main.handle("spellchecker.getOsLocale", () => app.getLocale());

    ipc.main.handle("config.setConfig", (_event, keyValues) => {
      Object.entries(keyValues).forEach(([key, value]) => {
        config.set(key as keyof typeof keyValues, value);
      });
    });

    ipc.main.handle("downloads.setLocation", async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ["openDirectory"],
        buttonLabel: "Select",
        defaultPath: config.get("downloads.location"),
      });

      if (canceled) {
        return { canceled: true };
      }

      config.set("downloads.location", filePaths[0]);

      return { canceled: false };
    });

    ipc.main.on("app.relaunch", () => {
      app.relaunch();
      app.quit();
    });

    ipc.main.on("theme.setTheme", (_event, theme) => {
      nativeTheme.themeSource = theme;

      config.set("theme", theme);
    });

    ipc.main.handle("app.getLoginItemSettings", () => app.getLoginItemSettings());

    ipc.main.handle("app.setLoginItemSettings", (_event, settings) => {
      app.setLoginItemSettings(settings);
    });

    ipc.main.handle("app.getIsDefaultMailtoClient", () =>
      app.isDefaultProtocolClient(MAILTO_PROTOCOL),
    );

    ipc.main.handle("app.setAsDefaultMailtoClient", () => {
      if (process.defaultApp) {
        if (process.argv.length >= 2) {
          if (!process.argv[1]) {
            throw new Error('Could not find "process.argv[1]"');
          }

          app.setAsDefaultProtocolClient(MAILTO_PROTOCOL, process.execPath, [
            path.resolve(process.argv[1]),
          ]);
        }
      } else {
        app.setAsDefaultProtocolClient(MAILTO_PROTOCOL);
      }
    });

    ipc.main.handle("about.getInfo", async () => ({
      version: app.getVersion(),
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      deviceId: await machineId(),
    }));

    ipc.main.handle("about.exportLogs", async () => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: "meru.log",
        buttonLabel: "Export",
      });

      if (canceled || !filePath) {
        return { canceled: true };
      }

      fs.copyFileSync(log.transports.file.getFile().path, filePath);

      return { canceled: false };
    });

    ipc.main.on("notifications.showTestNotification", () => {
      createNewEmailNotification({
        title: "Tim from Meru",
        subtitle: "Your test notification request",
        body: "This is a test notification, to show how a notification appears.",
      });
    });

    ipc.main.on("workspaceApp.showNotification", (event, notification) => {
      if (!areWorkspaceAppNotificationsAllowed()) {
        return;
      }

      const notifyingWorkspaceApp = WorkspaceApp.tryFromViewWebContents(event.sender);

      if (!notifyingWorkspaceApp) {
        return;
      }

      const workspaceAppLabel = notifyingWorkspaceApp.app
        ? workspaceApps[notifyingWorkspaceApp.app].label
        : undefined;

      const hasMultipleAccounts = accounts.getAccountConfigs().length > 1;

      let notificationTitle = workspaceAppLabel ?? notification.title;

      if (hasMultipleAccounts) {
        notificationTitle = `[${notifyingWorkspaceApp.account.config.label}] ${notificationTitle}`;
      }

      let subtitle: string | undefined;

      let body = notification.body;

      if (workspaceAppLabel) {
        if (platform.isMacOS) {
          subtitle = notification.title;
        } else {
          body = [notification.title, notification.body].filter(Boolean).join("\n");
        }
      }

      createNotification({
        title: notificationTitle,
        subtitle,
        body,
        silent: notifyingWorkspaceApp.app === "calendar" ? true : notification.silent,
        timeoutType: notification.requireInteraction ? "never" : "default",
        click: () => {
          if (notifyingWorkspaceApp.isWindowed) {
            notifyingWorkspaceApp.window.show();

            return;
          }

          main.show();

          notifyingWorkspaceApp.account.instance.tabs.activateTab(notifyingWorkspaceApp.id);

          if (notifyingWorkspaceApp.account.config.selected) {
            accounts.refreshSelectedAccountView();
          } else {
            accounts.selectAccount(notifyingWorkspaceApp.accountId);
          }
        },
      });
    });

    ipc.main.on("workspaceApps.openApp", (_event, app, modifierOpenBehavior) => {
      if (!licenseKey.isValid) {
        return;
      }

      if (!canOpenWorkspaceAppInApp(app)) {
        openExternalUrl(getWorkspaceAppUrl(app), {
          skipTrustedHostCheck: true,
          focusBrowser: modifierOpenBehavior !== "backgroundTab",
        });

        return;
      }

      const openBehavior = resolveWorkspaceAppOpenBehavior(modifierOpenBehavior);

      const selectedAccount = accounts.getSelectedAccount();

      if (openBehavior === "newWindow") {
        selectedAccount.instance.tabs.openWindowedTab(getWorkspaceAppUrl(app));

        return;
      }

      const workspaceApp = selectedAccount.instance.tabs.openTab(getWorkspaceAppUrl(app));

      if (openBehavior === "backgroundTab") {
        return;
      }

      selectedAccount.instance.tabs.activateTab(workspaceApp.id);

      accounts.refreshSelectedAccountView();
    });

    ipc.main.on("doNotDisturb.toggle", () => {
      doNotDisturb.toggle();
    });

    ipc.main.on("doNotDisturb.showOptions", () => {
      const options: MenuItemConstructorOptions[] = DoNotDisturb.options.map(
        ({ label, duration }) => ({
          label,
          type: "checkbox",
          checked: config.get("doNotDisturb.duration") === duration,
          click: () => {
            doNotDisturb.enable(duration);
          },
        }),
      );

      const menu = Menu.buildFromTemplate(
        config.get("doNotDisturb.enabled")
          ? [
              {
                label: "Disable",
                click: () => {
                  doNotDisturb.disable();
                },
              },
              { type: "separator" },
              ...options,
            ]
          : options,
      );

      menu.popup();
    });

    ipc.main.on("gmail.openUserStyles", (_event, openIn) => {
      if (!fs.existsSync(GMAIL_USER_STYLES_PATH)) {
        fs.closeSync(fs.openSync(GMAIL_USER_STYLES_PATH, "w"));
      }

      if (openIn === "editor") {
        shell.openPath(GMAIL_USER_STYLES_PATH);
      } else {
        shell.showItemInFolder(GMAIL_USER_STYLES_PATH);
      }
    });

    ipc.main.handle("license.getDeviceInfo", () => licenseKey.getDeviceInfo());

    ipc.main.handle("license.updateDeviceInfo", (_event, input) =>
      licenseKey.updateDeviceInfo(input),
    );

    ipc.main.on("gmail.navigateTo", (_event, hashLocation) => {
      ipc.renderer.send(
        accounts.getSelectedAccount().instance.gmail.view.webContents,
        "gmail.navigateTo",
        hashLocation,
      );
    });

    ipc.main.on("gmail.closeComposeWindow", (event) => {
      const composeWorkspaceApp = WorkspaceApp.tryFromViewWebContents(event.sender);

      if (!composeWorkspaceApp?.isWindowed) {
        return;
      }

      const composeWindow = composeWorkspaceApp.window;

      const gmailWebContents = composeWorkspaceApp.account.instance.gmail.view.webContents;

      composeWindow.hide();

      const browserWindowId = composeWindow.id;

      clearUndoSendLapseTimeout(browserWindowId);

      // Gmail's undo send period is configurable up to 30 seconds
      undoSendLapseTimeouts.set(
        browserWindowId,
        setTimeout(() => {
          if (!composeWindow.isDestroyed() && !composeWindow.isVisible()) {
            composeWindow.close();
          }
        }, ms("30s")),
      );

      composeWindow.once("closed", () => {
        clearUndoSendLapseTimeout(browserWindowId);

        if (gmailWebContents.isDestroyed()) {
          return;
        }

        ipc.renderer.send(
          gmailWebContents,
          "gmail.dismissMessageSentNotification",
          browserWindowId,
        );
      });

      if (gmailWebContents.isDestroyed()) {
        return;
      }

      ipc.renderer.send(gmailWebContents, "gmail.showMessageSentNotification", browserWindowId);
    });

    ipc.main.on("gmail.undoMessageSent", (_event, browserWindowId) => {
      const composeWindow = BrowserWindow.fromId(browserWindowId);

      if (!composeWindow) {
        return;
      }

      const composeWorkspaceApp = WorkspaceApp.tryFromWebContents(composeWindow.webContents);

      if (!composeWorkspaceApp) {
        return;
      }

      clearUndoSendLapseTimeout(browserWindowId);

      composeWindow.show();

      ipc.renderer.send(composeWorkspaceApp.view.webContents, "gmail.undoMessageSent");
    });

    ipc.main.on("gmail.setUserEmail", (event, email) => {
      const accountInstance = accounts.findInstanceByGmailWebContentsId(event.sender.id);

      if (accountInstance) {
        accountInstance.gmail.userEmail = email;
      }
    });

    ipc.main.on("downloads.dragFile", async (event, { id, filePath }) => {
      if (await downloads.markDownloadMissingIfGone(id, filePath)) {
        return;
      }

      event.sender.startDrag({
        file: filePath,
        icon: nativeImage.createFromDataURL(
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAABFklEQVR4nN3RzysEcRjH8afd1kE5ODg4ODgoBwcHRSFEfs0f4V9x9D+478HZqCmllB+llFLYqG1mWzTM0jhY6vtWa5GDnhnPiXe9Ls/38Dl8Rf5d3j3LXoPIa8CPEpyXcOElrOQemI+JFu4gs5jVXAOzt6CpNKGcwtzH7Ya1zAPTddA8vLqWjdQx075N1TOOTESgiV/cp/KjY7J9H69l+JOxKmium+6b9cS17qNVztWBkSvQ7KeO6PnLwZN7f7vEqQPDFbAQraEzsBCtwVOwEK2BE7AQrf5jsBCtviOwEK3eQ7AQrZ49sBCt7l2wEK2uHbAQrc5tsBCtUkDUEcBvlAJCdaDos1TwCQtbkItPWNxkUR34c70BSSmcO++HIKkAAAAASUVORK5CYII=",
        ),
      });
    });

    ipc.main.handle("bookmarks.getBookmarks", () => {
      return bookmarks.serialize();
    });

    ipc.main.on("bookmarks.togglePopup", (event, placement) => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender);

      if (!parentWindow) {
        return;
      }

      bookmarks.togglePopup(parentWindow, placement);
    });

    ipc.main.on("bookmarks.closePopup", () => {
      bookmarks.popup.close();
    });

    ipc.main.on("bookmarks.setPopupCloseOnBlurEnabled", (_event, enabled) => {
      bookmarks.popup.closeOnBlurEnabled = enabled;
    });

    ipc.main.on("bookmarks.openBookmark", (_event, accountId, bookmarkId) => {
      bookmarks.open(accountId, bookmarkId);
    });

    ipc.main.on("bookmarks.removeBookmark", (_event, accountId, bookmarkId) => {
      bookmarks.remove(accountId, bookmarkId);
    });

    ipc.main.on("bookmarks.moveBookmark", (_event, accountId, bookmarkId, targetIndex) => {
      bookmarks.move(accountId, bookmarkId, targetIndex);
    });

    ipc.main.handle("extensions.getActions", (event) => {
      return extensionActions.serialize(event.sender);
    });

    ipc.main.on("extensions.showActionsMenu", (event, anchorRect) => {
      extensionActions.showMenu(event.sender, anchorRect);
    });

    ipc.main.handle("extensions.getInstalled", () => {
      return getInstalledExtensions();
    });

    ipc.main.handle("extensions.install", async (_event, extensionId) => {
      if (!licenseKey.isValid) {
        return { error: "Meru Pro is required to install extensions" };
      }

      if (!isCuratedExtensionId(extensionId)) {
        return { error: "Meru doesn't offer this extension." };
      }

      try {
        await installCuratedExtension(extensionId);

        return {};
      } catch (error) {
        log.error("Failed to install extension", { extensionId, error: serializeError(error) });

        return {
          error: `Couldn't install the extension: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    });

    // Opting out is never gated, so an extension can be taken off a device that
    // has lost its license
    ipc.main.handle("extensions.uninstall", async (_event, extensionId) => {
      try {
        await uninstallCuratedExtension(extensionId);

        return {};
      } catch (error) {
        log.error("Failed to uninstall extension", { extensionId, error: serializeError(error) });

        return {
          error: `Couldn't uninstall the extension: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    });

    ipc.main.handle("extensions.update", async () => {
      if (!licenseKey.isValid) {
        return { error: "Meru Pro is required to update extensions" };
      }

      return { results: await extensionUpdater.checkForUpdates() };
    });

    ipc.main.on("downloads.toggleRecentDownloadHistoryPopup", (event) => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender);

      if (!parentWindow) {
        return;
      }

      if (downloads.toggleRecentDownloadHistoryPopup(parentWindow)) {
        downloads.checkDownloadHistoryItems(MAX_RECENT_DOWNLOAD_HISTORY_ITEMS);
      }
    });

    ipc.main.on("downloads.closeRecentDownloadHistoryPopup", () => {
      downloads.recentDownloadHistoryPopup.close();
    });

    ipc.main.on("downloads.setDownloadHistoryPopupOnBlurEnabled", (_event, enabled) => {
      downloads.recentDownloadHistoryPopup.closeOnBlurEnabled = enabled;
    });

    ipc.main.on("downloads.openDownloadHistory", () => {
      downloads.recentDownloadHistoryPopup.close();

      main.navigate("/download-history");

      downloads.checkDownloadHistoryItems();
    });

    this.main.on("gmail.unreadCountChanged", (event, unreadCountString) => {
      const parsedUnreadCountString = unreadCountString
        .split(":")
        .map((count) => Number(count.replaceAll(/\D/g, "")) || 0);

      const unreadCountPreference = config.get("gmail.unreadCountPreference");

      const unreadCount =
        parsedUnreadCountString.length === 2
          ? parsedUnreadCountString[unreadCountPreference === "first-section" ? 0 : 1]
          : parsedUnreadCountString[0];

      if (typeof unreadCount !== "number") {
        log.error(`Received invalid "unreadCount" from renderer:`, unreadCountString);

        return;
      }

      for (const account of accounts.instances.values()) {
        if (event.sender.id === account.gmail.view.webContents.id) {
          account.gmail.setUnreadCount(unreadCount);

          account.gmail.fetchInboxFeed();

          break;
        }
      }
    });

    this.main.on("gmail.openMessage", (_event, messageId) => {
      const selectedAccount = accounts.getSelectedAccount();

      ipc.renderer.send(
        selectedAccount.instance.gmail.view.webContents,
        "gmail.openMessage",
        messageId,
      );
    });
  }
}

export const ipc = new Ipc();
