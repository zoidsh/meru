import path from "node:path";
import { is, platform } from "@electron-toolkit/utils";
import { GITHUB_REPO_URL, WEBSITE_URL } from "@meru/shared/constants";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  shell,
} from "electron";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { showRestartDialog } from "@/dialogs";
import { GoogleApp } from "@/google-app";
import { ipc } from "@/ipc";
import { log } from "@/lib/log";
import { main } from "@/main";
import { appUpdater } from "@/updater";
import { openExternalUrl } from "@/url";
import { licenseKey } from "./license-key";
import { createMeruMessageUrl } from "./protocol";
import { appState } from "./state";

type MenuContext = { type: "main" } | { type: "googleApp"; googleApp: GoogleApp };

function getMenuContext(): MenuContext {
  const focusedWindow = BrowserWindow.getFocusedWindow();

  if (focusedWindow && focusedWindow !== main.window) {
    const googleApp = GoogleApp.tryFromWebContents(focusedWindow.webContents);

    if (googleApp) {
      return { type: "googleApp", googleApp };
    }
  }

  return { type: "main" };
}

function buildAppMenu(context: MenuContext): MenuItemConstructorOptions {
  const selectedAccount = accounts.getSelectedAccount();

  const macOSWindowItems: MenuItemConstructorOptions[] = [
    { label: `Hide ${app.name}`, role: "hide" },
    { label: "Hide Others", role: "hideOthers" },
    { label: "Show All", role: "unhide" },
    { type: "separator" },
  ];

  return {
    label: app.name,
    submenu: [
      {
        label: `About ${app.name}`,
        click: () => {
          dialog.showMessageBox({
            icon: nativeImage.createFromPath(
              path.join(__dirname, "..", "..", "static", "Icon.png"),
            ),
            message: `${app.name}`,
            detail: `Version: ${app.getVersion()}\n\nCreated by Tim Cheung <tim@meru.so>\n\nCopyright © ${new Date().getFullYear()} Meru`,
          });
        },
      },
      {
        label: "Check for Updates...",
        click: () => {
          appUpdater.checkForUpdates();
        },
      },
      { type: "separator" },
      {
        label: "Settings...",
        click: () => {
          main.navigate("/settings/accounts");
        },
      },
      {
        label: "Gmail Settings...",
        visible: context.type === "main",
        accelerator: "Command+,",
        click: () => {
          ipc.renderer.send(
            selectedAccount.instance.gmail.view.webContents,
            "gmail.navigateTo",
            "settings",
          );

          main.show();
        },
      },
      { type: "separator" },
      ...(platform.isMacOS ? macOSWindowItems : []),
      {
        label: `Quit ${app.name}`,
        accelerator: "CommandOrControl+Q",
        click: () => {
          app.quit();
        },
      },
    ],
  };
}

function buildFileMenu(context: MenuContext): MenuItemConstructorOptions {
  const selectedAccount = accounts.getSelectedAccount();

  return {
    role: "fileMenu",
    submenu: [
      {
        label: "Compose",
        visible: context.type === "main",
        click: () => {
          ipc.renderer.send(
            selectedAccount.instance.gmail.view.webContents,
            "gmail.navigateTo",
            "compose",
          );

          main.show();
        },
      },
      { type: "separator", visible: context.type === "main" },
      { role: "close" },
    ],
  };
}

function buildEditMenu(context: MenuContext): MenuItemConstructorOptions {
  return {
    role: "editMenu",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      {
        role: "pasteAndMatchStyle",
        accelerator: "CommandOrControl+Shift+V",
      },
      {
        role: "pasteAndMatchStyle",
        accelerator: "CommandOrControl+Option+Shift+V",
        visible: false,
        acceleratorWorksWhenHidden: platform.isMacOS,
      },
      { role: "delete" },
      { role: "selectAll" },
      { type: "separator" },
      {
        label: "Find...",
        accelerator: "CommandOrControl+F",
        click: () => {
          const targetWebContents =
            context.type === "googleApp"
              ? context.googleApp.window.webContents
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
  };
}

function buildMessageMenu(context: MenuContext): MenuItemConstructorOptions {
  const selectedAccount = accounts.getSelectedAccount();
  const userEmail = selectedAccount.instance.gmail.userEmail;
  const messageId = selectedAccount.instance.gmail.store.getState().messageId;

  const gmailMessageUrl =
    userEmail && messageId ? createMeruMessageUrl(userEmail, messageId) : null;

  return {
    label: "Message",
    visible: context.type === "main" && licenseKey.isValid,
    submenu: [
      {
        label: "Copy Message Link",
        enabled: Boolean(gmailMessageUrl),
        accelerator: "CommandOrControl+Shift+C",
        click: () => {
          if (gmailMessageUrl) {
            clipboard.writeText(gmailMessageUrl);
          }
        },
      },
      gmailMessageUrl
        ? {
            role: "shareMenu",
            sharingItem: { urls: [gmailMessageUrl] },
          }
        : {
            label: "Share",
            enabled: false,
            submenu: [],
          },
    ],
  };
}

function buildViewMenu(context: MenuContext): MenuItemConstructorOptions {
  const allAccounts = accounts.getAccounts();
  const selectedAccount = accounts.getSelectedAccount();

  const zoomIn = () => {
    if (context.type === "googleApp") {
      context.googleApp.zoomIn();

      return;
    }

    const zoomFactor = config.get("gmail.zoomFactor") + 0.1;

    for (const [_accountId, instance] of accounts.instances) {
      instance.gmail.view.webContents.setZoomFactor(zoomFactor);
    }

    config.set("gmail.zoomFactor", zoomFactor);
  };

  const zoomOut = () => {
    if (context.type === "googleApp") {
      context.googleApp.zoomOut();

      return;
    }

    const zoomFactor = config.get("gmail.zoomFactor") - 0.1;

    if (zoomFactor > 0) {
      for (const [_accountId, instance] of accounts.instances) {
        instance.gmail.view.webContents.setZoomFactor(zoomFactor);
      }

      config.set("gmail.zoomFactor", zoomFactor);
    }
  };

  const resetZoom = () => {
    if (context.type === "googleApp") {
      context.googleApp.resetZoom();

      return;
    }

    const defaultZoomFactor = 1;

    for (const [_accountId, instance] of accounts.instances) {
      instance.gmail.view.webContents.setZoomFactor(defaultZoomFactor);
    }

    config.set("gmail.zoomFactor", defaultZoomFactor);
  };

  const reload = () => {
    if (context.type === "googleApp") {
      context.googleApp.reload();

      return;
    }

    selectedAccount.instance.gmail.view.webContents.reload();
  };

  const hardReload = () => {
    if (context.type === "googleApp") {
      context.googleApp.hardReload();

      return;
    }

    selectedAccount.instance.gmail.view.webContents.reloadIgnoringCache();
  };

  const openDevTools = () => {
    if (context.type === "googleApp") {
      context.googleApp.window.webContents.openDevTools({ mode: "detach" });
      context.googleApp.view.webContents.openDevTools();

      return;
    }

    main.window.webContents.openDevTools({ mode: "detach" });
    selectedAccount.instance.gmail.view.webContents.openDevTools();
  };

  return {
    label: "View",
    submenu: [
      {
        label: "Unified Inbox",
        visible: context.type === "main",
        enabled: licenseKey.isValid && config.get("unifiedInbox.enabled") && allAccounts.length > 1,
        accelerator: "CommandOrControl+Shift+I",
        click: () => {
          main.navigate("/unified-inbox");
        },
      },
      {
        label: "Downloads",
        visible: context.type === "main",
        accelerator: "CommandOrControl+Alt+L",
        click: () => {
          main.navigate("/download-history");
        },
      },
      { type: "separator", visible: context.type === "main" },
      {
        label: "Reset Zoom",
        accelerator: "CommandOrControl+0",
        click: resetZoom,
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
      { type: "separator" },
      {
        label: "Reload",
        accelerator: "CommandOrControl+R",
        click: reload,
      },
      {
        label: "Hard Reload",
        accelerator: "CommandOrControl+Shift+R",
        click: hardReload,
      },
      { type: "separator" },
      {
        label: "Developer Tools",
        accelerator: platform.isMacOS ? "Command+Alt+I" : "Control+Shift+I",
        click: openDevTools,
      },
    ],
  };
}

function buildHistoryMenu(context: MenuContext): MenuItemConstructorOptions {
  const selectedAccount = accounts.getSelectedAccount();

  const goBack = () => {
    if (context.type === "googleApp") {
      context.googleApp.goBack();

      return;
    }

    selectedAccount.instance.gmail.view.webContents.navigationHistory.goBack();
  };

  const goForward = () => {
    if (context.type === "googleApp") {
      context.googleApp.goForward();

      return;
    }

    selectedAccount.instance.gmail.view.webContents.navigationHistory.goForward();
  };

  return {
    label: "History",
    submenu: [
      {
        label: "Back",
        accelerator: platform.isMacOS ? "Command+[" : "Alt+Left",
        click: goBack,
      },
      {
        label: "Forward",
        accelerator: platform.isMacOS ? "Command+]" : "Alt+Right",
        click: goForward,
      },
    ],
  };
}

function buildAccountsMenu(context: MenuContext): MenuItemConstructorOptions {
  const allAccounts = accounts.getAccounts();

  const selectNext = () => {
    accounts.selectNextAccount();
    appState.setIsSettingsOpen(false);
    main.show();
  };

  const selectPrevious = () => {
    accounts.selectPreviousAccount();
    appState.setIsSettingsOpen(false);
    main.show();
  };

  return {
    label: "Accounts",
    visible: context.type === "main",
    submenu: [
      ...allAccounts.map((account, index) => ({
        label: account.config.label,
        accelerator: `${platform.isLinux ? "Alt" : "CommandOrControl"}+${index + 1}`,
        click: () => {
          accounts.selectAccount(account.config.id);
          appState.setIsSettingsOpen(false);
          main.show();
        },
      })),
      { type: "separator" },
      {
        label: "Select Next Account",
        accelerator: "Ctrl+Tab",
        click: selectNext,
      },
      {
        label: "Select Next Account (hidden shortcut 1)",
        accelerator: "Command+Shift+]",
        visible: is.dev,
        acceleratorWorksWhenHidden: true,
        click: selectNext,
      },
      {
        label: "Select Next Account (hidden shortcut 2)",
        accelerator: "Command+Option+Right",
        visible: is.dev,
        acceleratorWorksWhenHidden: true,
        click: selectNext,
      },
      {
        label: "Select Previous Account",
        accelerator: "Ctrl+Shift+Tab",
        click: selectPrevious,
      },
      {
        label: "Select Previous Account (hidden shortcut 1)",
        accelerator: "Command+Shift+[",
        visible: is.dev,
        acceleratorWorksWhenHidden: true,
        click: selectPrevious,
      },
      {
        label: "Select Previous Account (hidden shortcut 2)",
        accelerator: "Command+Option+Left",
        visible: is.dev,
        acceleratorWorksWhenHidden: true,
        click: selectPrevious,
      },
      { type: "separator" },
      {
        label: "Manage Accounts...",
        click: () => {
          main.navigate("/settings/accounts");
        },
      },
    ],
  };
}

function buildWindowMenu(): MenuItemConstructorOptions {
  return {
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
  };
}

function buildHelpMenu(): MenuItemConstructorOptions {
  const selectedAccount = accounts.getSelectedAccount();

  return {
    label: "Help",
    role: "help",
    submenu: [
      {
        label: "Version History",
        click: () => {
          main.navigate("/settings/version-history");
        },
      },
      { type: "separator" },
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
      { type: "separator" },
      {
        label: "Gmail Keyboard Shortcuts",
        click: () => {
          openExternalUrl("https://support.google.com/mail/answer/6594");
        },
      },
      { type: "separator" },
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
      { type: "separator" },
      {
        label: "Troubleshooting",
        submenu: [
          {
            label: "Edit Config",
            click: () => {
              config.openInEditor();
            },
          },
          { type: "separator" },
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
            label: "Reset App",
            click: async () => {
              const { response } = await dialog.showMessageBox({
                type: "warning",
                buttons: ["Cancel", "Reset"],
                defaultId: 1,
                title: "Reset App",
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
          { type: "separator" },
          {
            label: "View Logs",
            click: () => {
              shell.openPath(log.transports.file.getFile().path);
            },
          },
        ],
      },
    ],
  };
}

export class AppMenu {
  private _menu: Menu | undefined;

  private _isPopupOpen = false;

  private _selectedAccountUnsubscribe: (() => void) | undefined;

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
    this._rebuildMenu();

    this._subscribeToSelectedAccount();

    this.menu.on("menu-will-show", () => {
      this._isPopupOpen = true;
    });

    this.menu.on("menu-will-close", () => {
      this._isPopupOpen = false;
    });

    config.onDidChange("accounts", () => {
      this._subscribeToSelectedAccount();

      this._rebuildMenu();
    });

    app.on("browser-window-focus", () => {
      this._rebuildMenu();
    });
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

  private _rebuildMenu() {
    const context = getMenuContext();

    const template: MenuItemConstructorOptions[] = [
      buildAppMenu(context),
      buildFileMenu(context),
      buildEditMenu(context),
      buildMessageMenu(context),
      buildViewMenu(context),
      buildHistoryMenu(context),
      buildAccountsMenu(context),
      buildWindowMenu(),
      buildHelpMenu(),
    ];

    this.menu = Menu.buildFromTemplate(template);

    Menu.setApplicationMenu(this.menu);
  }

  private _subscribeToSelectedAccount() {
    this._selectedAccountUnsubscribe?.();

    const selectedAccount = accounts.getSelectedAccount();

    this._selectedAccountUnsubscribe = selectedAccount.instance.gmail.store.subscribe(
      (state) => state.messageId,
      () => {
        this._rebuildMenu();
      },
    );
  }
}

export const appMenu = new AppMenu();
