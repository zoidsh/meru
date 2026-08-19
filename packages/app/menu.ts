import { is, platform } from "@electron-toolkit/utils";
import { GITHUB_REPO_URL, WEBSITE_URL } from "@meru/shared/constants";
import { getTabSection, getVisibleVerticalTabs, GMAIL_TAB_ID } from "@meru/shared/tabs";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { showRestartDialog } from "@/dialogs";
import { downloads } from "@/downloads";
import { ipc } from "@/ipc";
import { log } from "@/lib/log";
import { main } from "@/main";
import { appUpdater } from "@/updater";
import { openExternalUrl } from "@/url";
import { WorkspaceApp } from "@/workspace-app";
import { licenseKey } from "./license-key";
import { createMeruMessageUrl } from "./protocol";

export class AppMenu {
  private _menu: Menu | undefined;

  private _isPopupOpen = false;

  private _selectedAccountUnsubscribeFns: Set<() => void> = new Set();

  get menu() {
    if (!this._menu) {
      throw new Error("Menu not initialized");
    }

    return this._menu;
  }

  set menu(menu: Menu) {
    this._menu = menu;
  }

  init() {
    this._subscribeToSelectedAccount();

    this.refresh();

    config.onDidChange("accounts", () => {
      this._subscribeToSelectedAccount();

      this.refresh();
    });

    app.on("browser-window-focus", () => {
      this.refresh();
    });
  }

  refresh() {
    this.menu = this.createMenu();

    Menu.setApplicationMenu(this.menu);
  }

  private _subscribeToSelectedAccount() {
    for (const unsubscribe of this._selectedAccountUnsubscribeFns) {
      unsubscribe();
    }

    this._selectedAccountUnsubscribeFns.clear();

    const selectedAccount = accounts.getSelectedAccount();

    const gmailWebContents = selectedAccount.instance.gmail.view.webContents;

    const refreshMenu = () => {
      this.refresh();
    };

    gmailWebContents.on("did-navigate-in-page", refreshMenu);

    this._selectedAccountUnsubscribeFns.add(() => {
      if (!gmailWebContents.isDestroyed()) {
        gmailWebContents.removeListener("did-navigate-in-page", refreshMenu);
      }
    });
  }

  createMenu() {
    const macOSWindowItems: MenuItemConstructorOptions[] = [
      {
        label: `Hide ${app.name}`,
        role: "hide",
      },
      {
        label: "Hide Others",
        role: "hideOthers",
      },
      {
        label: "Show All",
        role: "unhide",
      },
      {
        type: "separator",
      },
    ];

    const focusedWindow = BrowserWindow.getFocusedWindow();

    const getActiveZoomTarget = () => {
      if (focusedWindow && focusedWindow !== main.window) {
        return WorkspaceApp.tryFromWebContents(focusedWindow.webContents);
      }

      const activeTab = accounts.getSelectedAccount().instance.tabs.activeTab;

      if (activeTab instanceof WorkspaceApp && !activeTab.isWindowed) {
        return activeTab;
      }

      return accounts.getSelectedAccount().instance.gmail;
    };

    const zoomIn = () => {
      getActiveZoomTarget()?.zoomIn();
    };

    const zoomOut = () => {
      getActiveZoomTarget()?.zoomOut();
    };

    const selectedAccount = accounts.getSelectedAccount();

    const getActiveViewWebContents = () => {
      if (focusedWindow && focusedWindow !== main.window) {
        const workspaceApp = WorkspaceApp.tryFromWebContents(focusedWindow.webContents);

        if (workspaceApp) {
          return workspaceApp.view.webContents;
        }
      }

      return (selectedAccount.instance.tabs.activeTab.view ?? selectedAccount.instance.gmail.view)
        .webContents;
    };

    const selectNextTab = () => {
      accounts.getSelectedAccount().instance.tabs.activateNextTab();

      main.navigate("/");

      accounts.refreshSelectedAccountView();
    };

    const selectPreviousTab = () => {
      accounts.getSelectedAccount().instance.tabs.activatePreviousTab();

      main.navigate("/");

      accounts.refreshSelectedAccountView();
    };

    /**
     * The nth entry of the pinned section as the strip shows it, Gmail counting
     * as the first.
     */
    const selectPinnedTab = (pinnedTabIndex: number) => {
      const selectedAccountTabs = accounts.getSelectedAccount().instance.tabs;

      const pinnedTabs = getVisibleVerticalTabs(selectedAccountTabs.serialize(), {
        workspaceAppsMode: config.get("workspaceApps.mode"),
        showWindows: config.get("verticalTabs.showWindows"),
      }).filter((tab) => getTabSection(tab) === "pinned");

      const pinnedTab = pinnedTabs[pinnedTabIndex];

      if (!pinnedTab) {
        return;
      }

      selectedAccountTabs.activateTab(pinnedTab.id);

      // A windowed entry is brought forward in its own window, which leaves the
      // main window showing whatever it already was.
      if (pinnedTab.windowed) {
        return;
      }

      main.navigate("/");

      accounts.refreshSelectedAccountView();
    };

    const selectPinnedTabItems: MenuItemConstructorOptions[] = Array.from(
      { length: 9 },
      (_pinnedTabEntry, pinnedTabIndex) => ({
        label: `Select Pinned Tab ${pinnedTabIndex + 1} (hidden shortcut)`,
        // Literal Ctrl on every platform, like the Ctrl+Tab pair above:
        // Command+Shift+3..6 are macOS screenshot shortcuts that never reach the
        // app, and Command/Ctrl+1..9 already select accounts.
        accelerator: `Ctrl+Shift+${pinnedTabIndex + 1}`,
        visible: is.dev,
        acceleratorWorksWhenHidden: true,
        click: () => {
          selectPinnedTab(pinnedTabIndex);
        },
      }),
    );

    const selectedAccountActiveTab = selectedAccount.instance.tabs.activeTab;

    // Exactly what the strip's close button offers: the pinned section — Gmail
    // included — carries no close button, so the shortcut has nothing to close
    // there either.
    const isActiveTabCloseable = getTabSection(selectedAccountActiveTab) !== "pinned";

    const isGmailVisible =
      focusedWindow === main.window &&
      main.location === "/" &&
      selectedAccount.instance.tabs.activeTab.id === GMAIL_TAB_ID;

    const userEmail = selectedAccount.instance.gmail.userEmail;
    const messageId = selectedAccount.instance.gmail.messageId;

    const copyOrShareMessageLink =
      isGmailVisible && userEmail && messageId && createMeruMessageUrl(userEmail, messageId);

    const isFindInPageEnabled =
      Boolean(focusedWindow && WorkspaceApp.tryFromWebContents(focusedWindow.webContents)) ||
      main.location === "/";

    const allAccounts = accounts.getAccounts();

    const template: MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          {
            label: `About ${app.name}`,
            click: () => {
              main.navigate("/settings/about");
            },
          },
          {
            label: "Check for Updates…",
            click: () => {
              appUpdater.checkForUpdates();
            },
          },
          {
            type: "separator",
          },
          {
            label: "Settings…",
            accelerator: "CommandOrControl+,",
            click: () => {
              main.navigate("/settings/general");
            },
          },
          {
            label: "Gmail Settings…",
            accelerator: "Command+Shift+,",
            click: () => {
              ipc.renderer.send(
                selectedAccount.instance.gmail.view.webContents,
                "gmail.navigateTo",
                "settings",
              );

              main.show();
            },
          },
          {
            type: "separator",
          },
          ...(platform.isMacOS ? macOSWindowItems : []),
          {
            label: `Quit ${app.name}`,
            accelerator: "CommandOrControl+Q",
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        role: "fileMenu",
        submenu: [
          {
            label: "Compose",
            visible: isGmailVisible,
            click: () => {
              ipc.renderer.send(
                selectedAccount.instance.gmail.view.webContents,
                "gmail.navigateTo",
                "compose",
              );

              main.show();
            },
          },
          {
            type: "separator",
            visible: isGmailVisible,
          },
          {
            role: "close",
          },
        ],
      },
      {
        role: "editMenu",
        submenu: [
          {
            role: "undo",
          },
          {
            role: "redo",
          },
          {
            type: "separator",
          },
          {
            role: "cut",
          },
          {
            role: "copy",
          },
          {
            role: "paste",
          },
          {
            role: "pasteAndMatchStyle",
            accelerator: "CommandOrControl+Shift+V",
          },
          {
            role: "pasteAndMatchStyle",
            accelerator: "CommandOrControl+Alt+Shift+V",
            visible: false,
            acceleratorWorksWhenHidden: platform.isMacOS,
          },
          {
            role: "delete",
          },
          {
            role: "selectAll",
          },
          {
            type: "separator",
          },
          {
            label: "Find…",
            accelerator: "CommandOrControl+F",
            enabled: isFindInPageEnabled,
            click: () => {
              const focusedWindow = BrowserWindow.getFocusedWindow();

              const targetWebContents =
                focusedWindow && WorkspaceApp.tryFromWebContents(focusedWindow.webContents)
                  ? focusedWindow.webContents
                  : main.window.webContents;

              ipc.renderer.send(targetWebContents, "findInPage.activate");

              targetWebContents.focus();
            },
          },
          {
            label: "Speech",
            submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
          },
        ],
      },
      {
        label: "Message",
        visible: licenseKey.isValid,
        submenu: [
          {
            label: "Copy Message Link",
            enabled: Boolean(copyOrShareMessageLink),
            accelerator: "CommandOrControl+Shift+C",
            click: () => {
              if (copyOrShareMessageLink) {
                clipboard.writeText(copyOrShareMessageLink);
              }
            },
          },
          copyOrShareMessageLink
            ? {
                role: "shareMenu",
                sharingItem: {
                  urls: [copyOrShareMessageLink],
                },
              }
            : {
                label: "Share",
                enabled: false,
                submenu: [],
              },
        ],
      },
      {
        label: "View",
        submenu: [
          {
            label: "Unified Inbox",
            enabled:
              licenseKey.isValid && config.get("unifiedInbox.enabled") && allAccounts.length > 1,
            accelerator: "CommandOrControl+Shift+I",
            click: () => {
              main.navigate("/unified-inbox");
            },
          },
          {
            label: "Downloads",
            accelerator: "CommandOrControl+Alt+L",
            click: () => {
              downloads.recentDownloadHistoryPopup.close();

              main.navigate("/download-history");

              downloads.checkDownloadHistoryItems();
            },
          },
          {
            type: "separator",
          },
          {
            label: "Reset Zoom",
            accelerator: "CommandOrControl+0",
            click: () => {
              getActiveZoomTarget()?.resetZoom();
            },
          },
          {
            label: "Zoom In",
            accelerator: "CommandOrControl+Plus",
            click: zoomIn,
          },
          {
            label: "Zoom In (hidden shortcut 1)",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            accelerator: "CommandOrControl+numadd",
            click: zoomIn,
          },
          {
            label: "Zoom Out",
            accelerator: "CommandOrControl+-",
            click: zoomOut,
          },
          {
            label: "Zoom Out (hidden shortcut 1)",
            visible: is.dev,
            accelerator: "CommandOrControl+numsub",
            click: zoomOut,
          },
          {
            type: "separator",
          },
          {
            label: "Reload",
            accelerator: "CommandOrControl+R",
            click: () => {
              getActiveViewWebContents().reload();
            },
          },
          {
            label: "Hard Reload",
            accelerator: "CommandOrControl+Shift+R",
            click: () => {
              getActiveViewWebContents().reloadIgnoringCache();
            },
          },
          {
            type: "separator",
          },
          {
            label: "Developer Tools",
            accelerator: is.dev && platform.isMacOS ? "Command+Alt+I" : undefined,
            click: () => {
              if (focusedWindow && focusedWindow !== main.window) {
                const workspaceApp = WorkspaceApp.tryFromWebContents(focusedWindow.webContents);

                if (workspaceApp) {
                  workspaceApp.window.webContents.openDevTools({ mode: "detach" });

                  workspaceApp.view.webContents.openDevTools();
                }

                return;
              }

              main.window.webContents.openDevTools({ mode: "detach" });

              getActiveViewWebContents().openDevTools();
            },
          },
        ],
      },
      {
        label: "History",
        submenu: [
          {
            label: "Back",
            accelerator: platform.isMacOS ? "Command+[" : "Alt+Left",
            click: () => {
              getActiveViewWebContents().navigationHistory.goBack();
            },
          },
          {
            label: "Forward",
            accelerator: platform.isMacOS ? "Command+]" : "Alt+Right",
            click: () => {
              getActiveViewWebContents().navigationHistory.goForward();
            },
          },
        ],
      },
      {
        label: "Tabs",
        submenu: [
          {
            label: "Select Next Tab",
            accelerator: "Ctrl+Tab",
            click: selectNextTab,
          },
          {
            label: "Select Next Tab (hidden shortcut 1)",
            accelerator: platform.isMacOS ? "Command+Option+Down" : "Ctrl+PageDown",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            click: selectNextTab,
          },
          {
            label: "Select Previous Tab",
            accelerator: "Ctrl+Shift+Tab",
            click: selectPreviousTab,
          },
          {
            label: "Select Previous Tab (hidden shortcut 1)",
            accelerator: platform.isMacOS ? "Command+Option+Up" : "Ctrl+PageUp",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            click: selectPreviousTab,
          },
          ...selectPinnedTabItems,
          {
            type: "separator",
          },
          {
            label: "Close Tab",
            accelerator: "CommandOrControl+Shift+W",
            enabled: isActiveTabCloseable,
            click: () => {
              const selectedAccountTabs = accounts.getSelectedAccount().instance.tabs;

              selectedAccountTabs.closeTab(selectedAccountTabs.activeTabId);

              accounts.refreshSelectedAccountView();
            },
          },
          {
            label: "Reopen Closed Tab",
            accelerator: "CommandOrControl+Shift+T",
            click: () => {
              if (accounts.getSelectedAccount().instance.tabs.reopenClosedTab()) {
                accounts.refreshSelectedAccountView();
              }
            },
          },
        ],
      },
      {
        label: "Accounts",
        submenu: [
          ...allAccounts.map((account, index) => ({
            label: account.config.label,
            click: () => {
              accounts.selectAccount(account.config.id);

              main.navigate("/");
            },
            accelerator: `${platform.isLinux ? "Alt" : "CommandOrControl"}+${index + 1}`,
          })),
          {
            type: "separator",
          },
          {
            label: "Select Next Account",
            accelerator: platform.isMacOS ? "Command+Shift+]" : undefined,
            click: () => {
              accounts.selectNextAccount();

              main.navigate("/");
            },
          },
          {
            label: "Select Next Account (hidden shortcut 1)",
            accelerator: "Command+Option+Right",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            click: () => {
              accounts.selectNextAccount();

              main.navigate("/");
            },
          },
          {
            label: "Select Previous Account",
            accelerator: platform.isMacOS ? "Command+Shift+[" : undefined,
            click: () => {
              accounts.selectPreviousAccount();

              main.navigate("/");
            },
          },
          {
            label: "Select Previous Account (hidden shortcut 1)",
            accelerator: "Command+Option+Left",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            click: () => {
              accounts.selectPreviousAccount();

              main.navigate("/");
            },
          },
          {
            type: "separator",
          },
          {
            label: "Manage Accounts…",
            click: () => {
              main.navigate("/settings/accounts");
            },
          },
        ],
      },
      {
        label: "Window",
        role: "window",
        submenu: [
          {
            label: "Minimize",
            accelerator: "CommandOrControl+M",
            role: "minimize",
          },
          {
            label: "Close",
            accelerator: "CommandOrControl+W",
            role: "close",
          },
        ],
      },
      {
        label: "Help",
        role: "help",
        submenu: [
          {
            label: "What's New",
            click: () => {
              main.navigate("/settings/version-history");
            },
          },
          {
            type: "separator",
          },
          {
            label: "Website",
            click: () => {
              openExternalUrl(WEBSITE_URL);
            },
          },
          {
            label: "Source Code",
            click: () => {
              openExternalUrl(GITHUB_REPO_URL);
            },
          },
          {
            type: "separator",
          },
          {
            label: "Gmail Keyboard Shortcuts",
            click: () => {
              openExternalUrl("https://support.google.com/mail/answer/6594");
            },
          },
          {
            type: "separator",
          },
          {
            label: "Ask Question",
            click: () => {
              selectedAccount.instance.gmail.createComposeWindow("mailto:tim@meru.so");
            },
          },
          {
            label: "Request Feature",
            click: () => {
              selectedAccount.instance.gmail.createComposeWindow(
                "mailto:tim@meru.so?subject=Feature%20Request:%20",
              );
            },
          },
          {
            label: "Report Issue",
            click: () => {
              selectedAccount.instance.gmail.createComposeWindow(
                "mailto:tim@meru.so?subject=Report Issue:%20",
              );
            },
          },
          {
            type: "separator",
          },
          {
            label: "Troubleshooting",
            submenu: [
              {
                label: "Edit Config",
                click: () => {
                  config.openInEditor();
                },
              },
              {
                type: "separator",
              },
              {
                label: "Clear Cache",
                click: async () => {
                  await Promise.all(
                    accounts.getAccounts().map((account) => account.instance.session.clearCache()),
                  );

                  showRestartDialog();
                },
              },
              {
                label: "Reset App…",
                click: async () => {
                  const { response } = await dialog.showMessageBox({
                    type: "warning",
                    buttons: ["Cancel", "Reset"],
                    defaultId: 1,
                    message: "Are you sure you want to reset the app?",
                    detail:
                      "This will clear all your accounts, settings, and data. This action cannot be undone.",
                  });

                  if (response === 0) {
                    return;
                  }

                  config.set("resetApp", true);

                  app.relaunch();

                  app.quit();
                },
              },
              {
                type: "separator",
              },
              {
                label: "View Logs",
                click: () => {
                  shell.openPath(log.transports.file.getFile().path);
                },
              },
            ],
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);

    menu.on("menu-will-show", () => {
      this._isPopupOpen = true;
    });

    menu.on("menu-will-close", () => {
      this._isPopupOpen = false;
    });

    return menu;
  }

  togglePopup() {
    if (this._isPopupOpen) {
      this.menu.closePopup(main.window);
    } else {
      this.menu.popup({
        window: main.window,
      });
    }
  }
}

export const appMenu = new AppMenu();
