import { is, platform } from "@electron-toolkit/utils";
import { t } from "@lingui/core/macro";
import { getAccountLabel } from "@meru/shared/accounts";
import { GITHUB_REPO_URL, WEBSITE_URL } from "@meru/shared/constants";
import { byPlatform } from "@meru/shared/platform";
import { getTabSection, getVisibleVerticalTabs, GMAIL_TAB_ID } from "@meru/shared/tabs";
import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions, shell } from "electron";
import { accounts } from "@/accounts";
import { getActiveView } from "@/active-view";
import { config } from "@/config";
import { showRestartDialog } from "@/dialogs";
import { downloads } from "@/downloads";
import { ipc } from "@/ipc";
import { copyText } from "@/lib/clipboard";
import { log } from "@/lib/log";
import { getNativeCancelLabel } from "@/lib/native-cancel-label";
import { relaunchApp } from "@/lib/relaunch";
import { main } from "@/main";
import { appUpdater } from "@/updater";
import { openExternalUrl } from "@/url";
import { WorkspaceApp } from "@/workspace-app";
import { createMeruMessageUrl } from "./lib/deep-link";
import { licenseKey } from "./license-key";

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
    const appName = app.name;

    // lingui-set comment="A menu or a menu item in Meru's menu bar"
    const macOSAppHideItems: MenuItemConstructorOptions[] = [
      {
        label: t({ message: `Hide ${appName}`, context: "macOS" }),
        role: "hide",
      },
      {
        label: t({ message: "Hide Others", context: "macOS" }),
        role: "hideOthers",
      },
      {
        label: t({ message: "Show All", context: "macOS" }),
        role: "unhide",
      },
      {
        type: "separator",
      },
    ];

    // Start Speaking and Stop Speaking are macOS-only roles, which do nothing
    // on Windows and Linux.
    const macOSSpeechItems: MenuItemConstructorOptions[] = [
      {
        label: t({ message: "Speech", context: "macOS" }),
        submenu: [
          { label: t({ message: "Start Speaking", context: "macOS" }), role: "startSpeaking" },
          { label: t({ message: "Stop Speaking", context: "macOS" }), role: "stopSpeaking" },
        ],
      },
    ];

    // Windows and Linux carry this item hidden, so only macOS ever shows its label.
    const minimizeItem: MenuItemConstructorOptions = {
      label: t({ message: "Minimize", context: "macOS" }),
      accelerator: "CommandOrControl+M",
      role: "minimize",
    };

    const pasteAndMatchStyleLabel = byPlatform(platform, {
      macOS: t({ message: "Paste and Match Style", context: "macOS" }),
      windows: t({ message: "Paste and Match Style", context: "Windows" }),
      linux: t({ message: "Paste and Match Style", context: "Linux" }),
    });

    // Only macOS has the system share menu the shareMenu role shows.
    const shareLabel = platform.isMacOS ? t({ message: "Share", context: "macOS" }) : t`Share`;

    // Zoom and Bring All to Front are macOS-only roles, and the Window menu
    // itself is a macOS convention, so the whole menu ships on macOS alone.
    const macOSWindowMenuItems: MenuItemConstructorOptions[] = [
      {
        label: t({ message: "Window", context: "macOS" }),
        role: "window",
        submenu: [
          minimizeItem,
          {
            label: t({
              message: "Zoom",
              context: "macOS",
              comment:
                "Window menu item that toggles the window between its size and filling the screen",
            }),
            role: "zoom",
          },
          {
            type: "separator",
          },
          {
            label: t({ message: "Bring All to Front", context: "macOS" }),
            role: "front",
          },
        ],
      },
    ];

    // Windows and Linux minimize from the titlebar window controls, and nothing
    // else binds Ctrl+M there, so the File menu carries Minimize as a shortcut
    // with no visible entry.
    const nonMacOSMinimizeItem: MenuItemConstructorOptions = {
      ...minimizeItem,
      visible: false,
    };

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
      getActiveZoomTarget()?.zoom("in");
    };

    const zoomOut = () => {
      getActiveZoomTarget()?.zoom("out");
    };

    const selectedAccount = accounts.getSelectedAccount();

    const getActiveViewWebContents = () => getActiveView(focusedWindow).webContents;

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
        // oxlint-disable-next-line lingui/no-unlocalized-strings -- shown only in development
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

    // The Message menu carries the license check, but a disabled parent leaves
    // its children live — their accelerators still fire on Windows and Linux —
    // so the license gates the link itself as well.
    const copyOrShareMessageLink =
      licenseKey.isValid &&
      isGmailVisible &&
      userEmail &&
      messageId &&
      createMeruMessageUrl(userEmail, messageId);

    const isFindInPageEnabled =
      Boolean(focusedWindow && WorkspaceApp.tryFromWebContents(focusedWindow.webContents)) ||
      main.location === "/";

    const allAccounts = accounts.getAccounts();

    const template: MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          {
            label: byPlatform(platform, {
              macOS: t({ message: `About ${appName}`, context: "macOS" }),
              windows: t({ message: `About ${appName}`, context: "Windows" }),
              linux: t({ message: `About ${appName}`, context: "Linux" }),
            }),
            click: () => {
              main.navigate("/settings/about");
            },
          },
          {
            label: byPlatform(platform, {
              macOS: t({ message: "Check for Updates…", context: "macOS" }),
              windows: t({ message: "Check for Updates…", context: "Windows" }),
              linux: t({ message: "Check for Updates…", context: "Linux" }),
            }),
            enabled: appUpdater.isUpdateSupported(),
            click: () => {
              appUpdater.checkForUpdates({ isManualCheck: true });
            },
          },
          {
            type: "separator",
          },
          {
            label: byPlatform(platform, {
              macOS: t({ message: "Settings", context: "macOS" }),
              windows: t({ message: "Settings", context: "Windows" }),
              linux: t({ message: "Settings", context: "Linux" }),
            }),
            accelerator: "CommandOrControl+,",
            click: () => {
              main.navigate("/settings/general");
            },
          },
          {
            label: t`Gmail Settings`,
            accelerator: "CommandOrControl+Shift+,",
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
          ...(platform.isMacOS ? macOSAppHideItems : []),
          {
            label: byPlatform(platform, {
              macOS: t({ message: `Quit ${appName}`, context: "macOS" }),
              windows: t({ message: `Quit ${appName}`, context: "Windows" }),
              linux: t({ message: `Quit ${appName}`, context: "Linux" }),
            }),
            accelerator: "CommandOrControl+Q",
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        label: byPlatform(platform, {
          macOS: t({ message: "File", context: "macOS" }),
          windows: t({ message: "File", context: "Windows" }),
          linux: t({ message: "File", context: "Linux" }),
        }),
        role: "fileMenu",
        submenu: [
          {
            label: byPlatform(platform, {
              macOS: t({
                message: "Compose",
                context: "macOS",
                comment: "File menu item that opens a new email in Gmail",
              }),
              windows: t({
                message: "Compose",
                context: "Windows",
                comment: "File menu item that opens a new email in Gmail",
              }),
              linux: t({
                message: "Compose",
                context: "Linux",
                comment: "File menu item that opens a new email in Gmail",
              }),
            }),
            enabled: isGmailVisible,
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
          },
          {
            label: byPlatform(platform, {
              macOS: t({ message: "Close Window", context: "macOS" }),
              windows: t({
                message: "Close",
                context: "Windows",
                comment: "File menu item that closes the window",
              }),
              linux: t({
                message: "Close",
                context: "Linux",
                comment: "File menu item that closes the window",
              }),
            }),
            role: "close",
          },
          ...(platform.isMacOS ? [] : [nonMacOSMinimizeItem]),
        ],
      },
      {
        label: byPlatform(platform, {
          macOS: t({ message: "Edit", context: "macOS" }),
          windows: t({ message: "Edit", context: "Windows" }),
          linux: t({ message: "Edit", context: "Linux" }),
        }),
        role: "editMenu",
        submenu: [
          {
            label: byPlatform(platform, {
              macOS: t({ message: "Undo", context: "macOS" }),
              windows: t({ message: "Undo", context: "Windows" }),
              linux: t({ message: "Undo", context: "Linux" }),
            }),
            role: "undo",
          },
          {
            label: byPlatform(platform, {
              macOS: t({ message: "Redo", context: "macOS" }),
              windows: t({ message: "Redo", context: "Windows" }),
              linux: t({ message: "Redo", context: "Linux" }),
            }),
            role: "redo",
          },
          {
            type: "separator",
          },
          {
            label: byPlatform(platform, {
              macOS: t({ message: "Cut", context: "macOS" }),
              windows: t({ message: "Cut", context: "Windows" }),
              linux: t({ message: "Cut", context: "Linux" }),
            }),
            role: "cut",
          },
          {
            label: byPlatform(platform, {
              macOS: t({ message: "Copy", context: "macOS" }),
              windows: t({ message: "Copy", context: "Windows" }),
              linux: t({ message: "Copy", context: "Linux" }),
            }),
            role: "copy",
          },
          {
            label: byPlatform(platform, {
              macOS: t({ message: "Paste", context: "macOS" }),
              windows: t({ message: "Paste", context: "Windows" }),
              linux: t({ message: "Paste", context: "Linux" }),
            }),
            role: "paste",
          },
          {
            label: pasteAndMatchStyleLabel,
            role: "pasteAndMatchStyle",
            accelerator: "CommandOrControl+Shift+V",
          },
          {
            label: pasteAndMatchStyleLabel,
            role: "pasteAndMatchStyle",
            accelerator: "CommandOrControl+Alt+Shift+V",
            visible: false,
            acceleratorWorksWhenHidden: platform.isMacOS,
          },
          {
            label: byPlatform(platform, {
              macOS: t({ message: "Delete", context: "macOS" }),
              windows: t({ message: "Delete", context: "Windows" }),
              linux: t({ message: "Delete", context: "Linux" }),
            }),
            role: "delete",
          },
          {
            label: byPlatform(platform, {
              macOS: t({ message: "Select All", context: "macOS" }),
              windows: t({ message: "Select All", context: "Windows" }),
              linux: t({ message: "Select All", context: "Linux" }),
            }),
            role: "selectAll",
          },
          {
            type: "separator",
          },
          {
            label: t`Find…`,
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
          ...(platform.isMacOS ? macOSSpeechItems : []),
        ],
      },
      {
        label: byPlatform(platform, {
          macOS: t({ message: "View", context: "macOS" }),
          windows: t({ message: "View", context: "Windows" }),
          linux: t({ message: "View", context: "Linux" }),
        }),
        submenu: [
          {
            label: t`Unified Inbox`,
            enabled:
              licenseKey.isValid && config.get("unifiedInbox.enabled") && allAccounts.length > 1,
            accelerator: "CommandOrControl+Shift+I",
            click: () => {
              main.navigate("/unified-inbox");
            },
          },
          {
            label: t`Downloads`,
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
            label: t`Actual Size`,
            accelerator: "CommandOrControl+0",
            click: () => {
              getActiveZoomTarget()?.resetZoom();
            },
          },
          {
            label: t`Zoom In`,
            accelerator: "CommandOrControl+Plus",
            click: zoomIn,
          },
          {
            // oxlint-disable-next-line lingui/no-unlocalized-strings -- shown only in development
            label: "Zoom In (hidden shortcut 1)",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            accelerator: "CommandOrControl+numadd",
            click: zoomIn,
          },
          {
            label: t`Zoom Out`,
            accelerator: "CommandOrControl+-",
            click: zoomOut,
          },
          {
            // oxlint-disable-next-line lingui/no-unlocalized-strings -- shown only in development
            label: "Zoom Out (hidden shortcut 1)",
            visible: is.dev,
            accelerator: "CommandOrControl+numsub",
            click: zoomOut,
          },
          {
            type: "separator",
          },
          {
            label: t`Reload`,
            accelerator: "CommandOrControl+R",
            click: () => {
              getActiveViewWebContents().reload();
            },
          },
          {
            label: t`Hard Reload`,
            accelerator: "CommandOrControl+Shift+R",
            click: () => {
              getActiveViewWebContents().reloadIgnoringCache();
            },
          },
          {
            type: "separator",
          },
          {
            label: t`Developer Tools`,
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
        label: t`Message`,
        enabled: licenseKey.isValid,
        submenu: [
          {
            label: t`Copy Message Link`,
            enabled: Boolean(copyOrShareMessageLink),
            accelerator: "CommandOrControl+Shift+C",
            click: () => {
              if (copyOrShareMessageLink) {
                copyText(copyOrShareMessageLink);
              }
            },
          },
          copyOrShareMessageLink
            ? {
                label: shareLabel,
                role: "shareMenu",
                sharingItem: {
                  urls: [copyOrShareMessageLink],
                },
              }
            : {
                label: shareLabel,
                enabled: false,
                submenu: [],
              },
        ],
      },
      {
        label: t`History`,
        submenu: [
          {
            label: t`Back`,
            accelerator: platform.isMacOS ? "Command+[" : "Alt+Left",
            click: () => {
              getActiveViewWebContents().navigationHistory.goBack();
            },
          },
          {
            label: t`Forward`,
            accelerator: platform.isMacOS ? "Command+]" : "Alt+Right",
            click: () => {
              getActiveViewWebContents().navigationHistory.goForward();
            },
          },
        ],
      },
      {
        label: t`Tabs`,
        submenu: [
          {
            label: t`Select Next Tab`,
            accelerator: "Ctrl+Tab",
            click: selectNextTab,
          },
          {
            // oxlint-disable-next-line lingui/no-unlocalized-strings -- shown only in development
            label: "Select Next Tab (hidden shortcut 1)",
            accelerator: platform.isMacOS ? "Command+Option+Down" : "Ctrl+PageDown",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            click: selectNextTab,
          },
          {
            label: t`Select Previous Tab`,
            accelerator: "Ctrl+Shift+Tab",
            click: selectPreviousTab,
          },
          {
            // oxlint-disable-next-line lingui/no-unlocalized-strings -- shown only in development
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
            label: t`Close Tab`,
            accelerator: "CommandOrControl+Shift+W",
            enabled: isActiveTabCloseable,
            click: () => {
              const selectedAccountTabs = accounts.getSelectedAccount().instance.tabs;

              selectedAccountTabs.closeTab(selectedAccountTabs.activeTabId);

              accounts.refreshSelectedAccountView();
            },
          },
          {
            label: t`Reopen Closed Tab`,
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
        label: t`Accounts`,
        submenu: [
          ...allAccounts.map((account, index) => ({
            label: getAccountLabel(account.config.label),
            click: () => {
              accounts.selectAccount(account.config.id);

              main.navigate("/");
            },
            // Only the first nine. Electron takes an `Alt+10` without
            // complaint, and no key combination ever produces it, so the tenth
            // account onwards gets no shortcut rather than a dead one.
            accelerator:
              index < 9
                ? `${platform.isLinux ? "Alt" : "CommandOrControl"}+${index + 1}`
                : undefined,
          })),
          {
            type: "separator",
          },
          {
            label: t`Select Next Account`,
            accelerator: platform.isMacOS ? "Command+Shift+]" : undefined,
            click: () => {
              accounts.selectNextAccount();

              main.navigate("/");
            },
          },
          {
            // oxlint-disable-next-line lingui/no-unlocalized-strings -- shown only in development
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
            label: t`Select Previous Account`,
            accelerator: platform.isMacOS ? "Command+Shift+[" : undefined,
            click: () => {
              accounts.selectPreviousAccount();

              main.navigate("/");
            },
          },
          {
            // oxlint-disable-next-line lingui/no-unlocalized-strings -- shown only in development
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
            label: t`Manage Accounts`,
            click: () => {
              main.navigate("/settings/accounts");
            },
          },
        ],
      },
      ...(platform.isMacOS ? macOSWindowMenuItems : []),
      {
        label: byPlatform(platform, {
          macOS: t({ message: "Help", context: "macOS" }),
          windows: t({ message: "Help", context: "Windows" }),
          linux: t({ message: "Help", context: "Linux" }),
        }),
        role: "help",
        submenu: [
          {
            label: t`What's New`,
            click: () => {
              main.navigate("/settings/version-history");
            },
          },
          {
            type: "separator",
          },
          {
            label: t`Website`,
            click: () => {
              openExternalUrl(WEBSITE_URL);
            },
          },
          {
            label: t`Source Code`,
            click: () => {
              openExternalUrl(GITHUB_REPO_URL);
            },
          },
          {
            type: "separator",
          },
          {
            label: t`Gmail Keyboard Shortcuts`,
            click: () => {
              openExternalUrl("https://support.google.com/mail/answer/6594");
            },
          },
          {
            type: "separator",
          },
          {
            label: t`Ask Question…`,
            click: () => {
              selectedAccount.instance.gmail.createComposeWindow("mailto:tim@meru.so");
            },
          },
          {
            label: t`Request Feature…`,
            click: () => {
              selectedAccount.instance.gmail.createComposeWindow(
                "mailto:tim@meru.so?subject=Feature%20Request:%20",
              );
            },
          },
          {
            label: t`Report Issue…`,
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
            label: t`Troubleshooting`,
            submenu: [
              {
                label: t`Edit Config`,
                click: () => {
                  config.openInEditor();
                },
              },
              {
                label: t`View Logs`,
                click: () => {
                  shell.openPath(log.transports.file.getFile().path);
                },
              },
              {
                type: "separator",
              },
              {
                label: t`Clear Cache`,
                click: async () => {
                  await Promise.all(
                    accounts.getAccounts().map((account) => account.instance.session.clearCache()),
                  );

                  showRestartDialog();
                },
              },
              {
                type: "separator",
              },
              {
                label: t`Reset App`,
                click: async () => {
                  // lingui-reset
                  const { response } = await dialog.showMessageBox({
                    type: "warning",
                    buttons: [
                      getNativeCancelLabel(),
                      t({
                        message: "Reset",
                        comment: "Button in the Reset App dialog that erases Meru's data",
                      }),
                    ],
                    defaultId: 1,
                    message: t`Reset Meru to its original state?`,
                    detail: t`This signs out of every account and clears all settings and data on this device. It can't be undone.`,
                  });

                  if (response === 0) {
                    return;
                  }

                  config.set("resetApp", true);

                  relaunchApp();

                  app.quit();
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

  /** Without an anchor the menu comes up at the pointer, which is where a click left it. */
  togglePopup(anchor?: { x: number; y: number }) {
    if (this._isPopupOpen) {
      this.menu.closePopup(main.window);
    } else {
      this.menu.popup({
        window: main.window,
        ...anchor,
      });
    }
  }
}

export const appMenu = new AppMenu();
