import path from "node:path";
import { is, platform } from "@electron-toolkit/utils";
import { GITHUB_REPO_URL, WEBSITE_URL } from "@meru/shared/constants";
import { getGoogleAppUrl } from "@meru/shared/google";
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
import { createMeruMessageUrl } from "./protocol";
import { licenseKey } from "./license-key";
import { appState } from "./state";
import { clamp } from "@meru/shared/utils";

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
    this.menu = this.createMenu();

    this._subscribeToSelectedAccount();

    this.menu.on("menu-will-show", () => {
      this._isPopupOpen = true;
    });

    this.menu.on("menu-will-close", () => {
      this._isPopupOpen = false;
    });

    Menu.setApplicationMenu(this.menu);

    config.onDidChange("accounts", () => {
      this.menu = this.createMenu();

      this._subscribeToSelectedAccount();

      Menu.setApplicationMenu(this.menu);
    });

    app.on("browser-window-focus", () => {
      this.menu = this.createMenu();

      Menu.setApplicationMenu(this.menu);
    });
  }

  private _subscribeToSelectedAccount() {
    for (const unsubscribe of this._selectedAccountUnsubscribeFns) {
      unsubscribe();
    }

    const selectedAccount = accounts.getSelectedAccount();

    this._selectedAccountUnsubscribeFns.add(
      selectedAccount.instance.gmail.store.subscribe(
        (state) => state.messageId,
        () => {
          this.menu = this.createMenu();

          Menu.setApplicationMenu(this.menu);
        },
      ),
    );
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

    const MIN_ZOOM_FACTOR = 0.1;
    const MAX_ZOOM_FACTOR = 3;

    const zoomIn = () => {
      if (focusedWindow && focusedWindow !== main.window) {
        focusedWindow.webContents.setZoomFactor(
          clamp(focusedWindow.webContents.getZoomFactor() + 0.1, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR),
        );

        return;
      }

      const zoomFactor = config.get("gmail.zoomFactor") + 0.1;

      for (const [_accountId, instance] of accounts.instances) {
        instance.gmail.view.webContents.setZoomFactor(zoomFactor);
      }

      config.set("gmail.zoomFactor", zoomFactor);
    };

    const zoomOut = () => {
      if (focusedWindow && focusedWindow !== main.window) {
        focusedWindow.webContents.setZoomFactor(
          clamp(focusedWindow.webContents.getZoomFactor() - 0.1, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR),
        );

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

    const selectedAccount = accounts.getSelectedAccount();

    const userEmail = selectedAccount.instance.gmail.userEmail;
    const messageId = selectedAccount.instance.gmail.store.getState().messageId;

    const copyOrShareMessageLink =
      userEmail && messageId && createMeruMessageUrl(userEmail, messageId);

    const allAccounts = accounts.getAccounts();

    const template: MenuItemConstructorOptions[] = [
      {
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
          {
            type: "separator",
          },
          {
            label: "Settings...",
            click: () => {
              main.navigate("/settings/accounts");
            },
          },
          {
            label: "Gmail Settings...",
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
            accelerator: "CommandOrControl+Option+Shift+V",
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
            label: "Find...",
            accelerator: "CommandOrControl+F",
            click: () => {
              const focusedWindow = BrowserWindow.getFocusedWindow();

              const targetWebContents =
                focusedWindow && GoogleApp.fromWebContents(focusedWindow.webContents)
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
            enabled: focusedWindow === main.window && Boolean(copyOrShareMessageLink),
            accelerator: "CommandOrControl+Shift+C",
            click: () => {
              if (copyOrShareMessageLink) {
                clipboard.writeText(copyOrShareMessageLink);
              }
            },
          },
          focusedWindow === main.window && copyOrShareMessageLink
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
              main.navigate("/download-history");
            },
          },
          {
            type: "separator",
          },
          {
            label: "Reset Zoom",
            accelerator: "CommandOrControl+0",
            click: () => {
              const defaultZoomFactor = 1;

              if (focusedWindow && focusedWindow !== main.window) {
                focusedWindow.webContents.setZoomFactor(defaultZoomFactor);

                return;
              }

              for (const [_accountId, instance] of accounts.instances) {
                instance.gmail.view.webContents.setZoomFactor(defaultZoomFactor);
              }

              config.set("gmail.zoomFactor", defaultZoomFactor);
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
              if (focusedWindow && focusedWindow !== main.window) {
                focusedWindow.webContents.reload();

                return;
              }

              selectedAccount.instance.gmail.view.webContents.reload();
            },
          },
          {
            label: "Hard Reload",
            accelerator: "CommandOrControl+Shift+R",
            click: async () => {
              if (focusedWindow && focusedWindow !== main.window) {
                focusedWindow.webContents.reloadIgnoringCache();

                return;
              }

              selectedAccount.instance.gmail.view.webContents.reloadIgnoringCache();
            },
          },
          {
            type: "separator",
          },
          {
            label: "Developer Tools",
            accelerator: platform.isMacOS ? "Command+Alt+I" : "Control+Shift+I",
            click: () => {
              if (focusedWindow && focusedWindow !== main.window) {
                focusedWindow.webContents.openDevTools();

                return;
              }

              main.window.webContents.openDevTools({ mode: "detach" });

              selectedAccount.instance.gmail.view.webContents.openDevTools();
            },
          },
          {
            label: "Open Google Docs in GoogleApp window",
            visible: is.dev,
            accelerator: "CommandOrControl+T",
            click: () => {
              new GoogleApp({
                accountId: selectedAccount.config.id,
                app: "docs",
                url: getGoogleAppUrl("docs"),
                session: selectedAccount.instance.session,
              });
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
              if (focusedWindow && focusedWindow !== main.window) {
                focusedWindow.webContents.navigationHistory.goBack();

                return;
              }

              selectedAccount.instance.gmail.view.webContents.navigationHistory.goBack();
            },
          },
          {
            label: "Forward",
            accelerator: platform.isMacOS ? "Command+]" : "Alt+Right",
            click: () => {
              if (focusedWindow && focusedWindow !== main.window) {
                focusedWindow.webContents.navigationHistory.goForward();

                return;
              }

              selectedAccount.instance.gmail.view.webContents.navigationHistory.goForward();
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

              appState.setIsSettingsOpen(false);

              main.show();
            },
            accelerator: `${platform.isLinux ? "Alt" : "CommandOrControl"}+${index + 1}`,
          })),
          {
            type: "separator",
          },
          {
            label: "Select Next Account",
            accelerator: "Ctrl+Tab",
            click: () => {
              accounts.selectNextAccount();

              appState.setIsSettingsOpen(false);

              main.show();
            },
          },
          {
            label: "Select Next Account (hidden shortcut 1)",
            accelerator: "Command+Shift+]",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            click: () => {
              accounts.selectNextAccount();

              appState.setIsSettingsOpen(false);

              main.show();
            },
          },
          {
            label: "Select Next Account (hidden shortcut 2)",
            accelerator: "Command+Option+Right",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            click: () => {
              accounts.selectNextAccount();

              appState.setIsSettingsOpen(false);

              main.show();
            },
          },
          {
            label: "Select Previous Account",
            accelerator: "Ctrl+Shift+Tab",
            click: () => {
              accounts.selectPreviousAccount();

              appState.setIsSettingsOpen(false);

              main.show();
            },
          },
          {
            label: "Select Previous Account (hidden shortcut 1)",
            accelerator: "Command+Shift+[",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            click: () => {
              accounts.selectPreviousAccount();

              appState.setIsSettingsOpen(false);

              main.show();
            },
          },
          {
            label: "Select Previous Account (hidden shortcut 2)",
            accelerator: "Command+Option+Left",
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            click: () => {
              accounts.selectPreviousAccount();

              appState.setIsSettingsOpen(false);

              main.show();
            },
          },
          {
            type: "separator",
          },
          {
            label: "Manage Accounts...",
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
            label: "Version History",
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

    return Menu.buildFromTemplate(template);
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
