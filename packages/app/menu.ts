import path from "node:path";
import { is, platform } from "@electron-toolkit/utils";
import { t } from "@meru/i18n";
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
import log from "electron-log";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { showRestartDialog } from "@/dialogs";
import { ipc } from "@/ipc";
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
        label: t("menu.app.hide", { appName: app.name }),
        role: "hide",
      },
      {
        label: t("menu.app.hideOthers"),
        role: "hideOthers",
      },
      {
        label: t("menu.app.showAll"),
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
            label: t("menu.app.about", { appName: app.name }),
            click: () => {
              dialog.showMessageBox({
                icon: nativeImage.createFromPath(
                  path.join(__dirname, "..", "..", "static", "Icon.png"),
                ),
                message: `${app.name}`,
                detail: t("menu.app.aboutDetail", {
                  version: app.getVersion(),
                  year: new Date().getFullYear(),
                }),
              });
            },
          },
          {
            label: t("menu.app.checkForUpdates"),
            click: () => {
              appUpdater.checkForUpdates();
            },
          },
          {
            type: "separator",
          },
          {
            label: t("menu.app.settings"),
            click: () => {
              main.navigate("/settings/accounts");
            },
          },
          {
            label: t("menu.app.gmailSettings"),
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
            label: t("menu.app.quit", { appName: app.name }),
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
            label: t("menu.file.compose"),
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
            label: t("menu.edit.find"),
            accelerator: "CommandOrControl+F",
            click: () => {
              ipc.renderer.send(main.window.webContents, "findInPage.activate");

              main.window.webContents.focus();
            },
          },
          {
            label: t("menu.edit.speech"),
            submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
          },
        ],
      },
      {
        label: t("menu.message.title"),
        visible: licenseKey.isValid,
        submenu: [
          {
            label: t("menu.message.copyMessageLink"),
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
                label: t("menu.message.share"),
                enabled: false,
                submenu: [],
              },
        ],
      },
      {
        label: t("menu.view.title"),
        submenu: [
          {
            label: t("menu.view.unifiedInbox"),
            enabled:
              licenseKey.isValid && config.get("unifiedInbox.enabled") && allAccounts.length > 1,
            accelerator: "CommandOrControl+Shift+I",
            click: () => {
              main.navigate("/unified-inbox");
            },
          },
          {
            label: t("menu.view.downloads"),
            accelerator: "CommandOrControl+Alt+L",
            click: () => {
              main.navigate("/download-history");
            },
          },
          {
            type: "separator",
          },
          {
            label: t("menu.view.resetZoom"),
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
            label: t("menu.view.zoomIn"),
            accelerator: "CommandOrControl+Plus",
            click: zoomIn,
          },
          {
            label: t("menu.view.zoomInHidden1"),
            visible: is.dev,
            acceleratorWorksWhenHidden: true,
            accelerator: "CommandOrControl+numadd",
            click: zoomIn,
          },
          {
            label: t("menu.view.zoomOut"),
            accelerator: "CommandOrControl+-",
            click: zoomOut,
          },
          {
            label: t("menu.view.zoomOutHidden1"),
            visible: is.dev,
            accelerator: "CommandOrControl+numsub",
            click: zoomOut,
          },
          {
            type: "separator",
          },
          {
            label: t("menu.view.reload"),
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
            label: t("menu.view.hardReload"),
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
            label: t("menu.view.developerTools"),
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
        ],
      },
      {
        label: t("menu.history.title"),
        submenu: [
          {
            label: t("menu.history.back"),
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
            label: t("menu.history.forward"),
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
        label: t("menu.accounts.title"),
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
            label: t("menu.accounts.selectNext"),
            accelerator: "Ctrl+Tab",
            click: () => {
              accounts.selectNextAccount();

              appState.setIsSettingsOpen(false);

              main.show();
            },
          },
          {
            label: t("menu.accounts.selectNextHidden1"),
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
            label: t("menu.accounts.selectNextHidden2"),
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
            label: t("menu.accounts.selectPrevious"),
            accelerator: "Ctrl+Shift+Tab",
            click: () => {
              accounts.selectPreviousAccount();

              appState.setIsSettingsOpen(false);

              main.show();
            },
          },
          {
            label: t("menu.accounts.selectPreviousHidden1"),
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
            label: t("menu.accounts.selectPreviousHidden2"),
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
            label: t("menu.accounts.manageAccounts"),
            click: () => {
              main.navigate("/settings/accounts");
            },
          },
        ],
      },
      {
        label: t("menu.window.title"),
        role: "window",
        submenu: [
          {
            label: t("menu.window.minimize"),
            accelerator: "CommandOrControl+M",
            role: "minimize",
          },
          {
            label: t("menu.window.close"),
            accelerator: "CommandOrControl+W",
            role: "close",
          },
        ],
      },
      {
        label: t("menu.help.title"),
        role: "help",
        submenu: [
          {
            label: t("menu.help.versionHistory"),
            click: () => {
              main.navigate("/settings/version-history");
            },
          },
          {
            type: "separator",
          },
          {
            label: t("menu.help.website"),
            click: () => {
              openExternalUrl(WEBSITE_URL);
            },
          },
          {
            label: t("menu.help.sourceCode"),
            click: () => {
              openExternalUrl(GITHUB_REPO_URL);
            },
          },
          {
            type: "separator",
          },
          {
            label: t("menu.help.gmailKeyboardShortcuts"),
            click: () => {
              openExternalUrl("https://support.google.com/mail/answer/6594");
            },
          },
          {
            type: "separator",
          },
          {
            label: t("menu.help.askQuestion"),
            click: () => {
              selectedAccount.instance.gmail.createComposeWindow("mailto:tim@meru.so");
            },
          },
          {
            label: t("menu.help.requestFeature"),
            click: () => {
              selectedAccount.instance.gmail.createComposeWindow(
                "mailto:tim@meru.so?subject=Feature%20Request:%20",
              );
            },
          },
          {
            label: t("menu.help.reportIssue"),
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
            label: t("menu.help.troubleshooting"),
            submenu: [
              {
                label: t("menu.help.editConfig"),
                click: () => {
                  config.openInEditor();
                },
              },
              {
                type: "separator",
              },
              {
                label: t("menu.help.clearCache"),
                click: async () => {
                  await Promise.all(
                    accounts.getAccounts().map((account) => account.instance.session.clearCache()),
                  );

                  showRestartDialog();
                },
              },
              {
                label: t("menu.help.resetApp"),
                click: async () => {
                  const { response } = await dialog.showMessageBox({
                    type: "warning",
                    buttons: [
                      t("menu.help.resetAppDialog.cancel"),
                      t("menu.help.resetAppDialog.reset"),
                    ],
                    defaultId: 1,
                    title: t("menu.help.resetAppDialog.title"),
                    message: t("menu.help.resetAppDialog.message"),
                    detail: t("menu.help.resetAppDialog.detail"),
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
                label: t("menu.help.viewLogs"),
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
