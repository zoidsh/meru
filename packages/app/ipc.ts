import fs from "node:fs";
import path from "node:path";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import { is, platform } from "@electron-toolkit/utils";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  Notification,
  nativeImage,
  nativeTheme,
  shell,
} from "electron";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appMenu } from "@/menu";
import { appState } from "@/state";
import { DoNotDisturb, doNotDisturb } from "./do-not-disturb";
import { GMAIL_USER_STYLES_PATH } from "./gmail";
import { extractVerificationCode, parseUnreadCountString } from "./lib/utils";
import { createNotification } from "./notifications";
import { MAILTO_PROTOCOL } from "./protocol";
import { appUpdater } from "./updater";

class Ipc {
  main = new IpcListener<IpcMainEvents>();

  renderer = new IpcEmitter<IpcRendererEvent>();

  init() {
    this.main.on("settings.toggleIsOpen", () => {
      appState.toggleIsSettingsOpen();

      if (appState.isSettingsOpen) {
        accounts.hide();
      } else {
        accounts.show();
      }
    });

    config.onDidChange("accounts", () => {
      this.renderer.send(
        main.window.webContents,
        "accounts.changed",
        accounts.getAccounts().map((account) => ({
          config: account.config,
          gmail: {
            ...account.instance.gmail.store.getState(),
            ...account.instance.gmail.viewStore.getState(),
          },
        })),
      );
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

    this.main.on("accounts.moveAccount", (_event, movedAccountId, direction) => {
      accounts.moveAccount(movedAccountId, direction);
    });

    this.main.on("gmail.moveNavigationHistory", (_event, action) => {
      accounts
        .getSelectedAccount()
        .instance.gmail.view.webContents.navigationHistory[
          action === "back" ? "goBack" : "goForward"
        ]();
    });

    this.main.on("gmail.setUnreadCount", (event, unreadCountString) => {
      const unreadCount = parseUnreadCountString(unreadCountString);

      for (const accountInstance of accounts.instances.values()) {
        if (event.sender.id === accountInstance.gmail.view.webContents.id) {
          accountInstance.gmail.setUnreadCount(unreadCount);
        }
      }
    });

    this.main.on("gmail.setOutOfOffice", (event, outOfOffice) => {
      for (const accountInstance of accounts.instances.values()) {
        if (event.sender.id === accountInstance.gmail.view.webContents.id) {
          accountInstance.gmail.store.setState({
            outOfOffice,
          });
        }
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

    this.main.on("findInPage", (_event, text, options) => {
      const selectedAccount = accounts.getSelectedAccount();

      if (!text) {
        selectedAccount.instance.gmail.view.webContents.stopFindInPage("clearSelection");

        return;
      }

      selectedAccount.instance.gmail.view.webContents.findInPage(text, {
        forward: options?.forward,
        findNext: options?.findNext,
      });
    });

    if (Notification.isSupported()) {
      this.main.on("gmail.handleNewMessages", async (event, mails) => {
        for (const mail of mails) {
          for (const [accountId, instance] of accounts.instances) {
            if (instance.gmail.view.webContents.id === event.sender.id) {
              const account = accounts.getAccount(accountId);

              let subtitle: string | undefined;

              if (platform.isMacOS && config.get("notifications.showSubject")) {
                subtitle = mail.subject;
              }

              let body: string | undefined;

              if (platform.isMacOS && config.get("notifications.showSummary")) {
                body = mail.summary;
              } else if (!platform.isMacOS && config.get("notifications.showSubject")) {
                body = mail.subject;
              }

              if (licenseKey.isValid && config.get("verificationCodes.autoCopy")) {
                const verificationCode = extractVerificationCode(
                  [subtitle, body].filter((text) => typeof text === "string"),
                );

                if (verificationCode) {
                  clipboard.writeText(verificationCode);

                  createNotification({
                    title: config.get("notifications.showSender")
                      ? mail.sender.name
                      : account.config.label,
                    body: `Copied verification code ${verificationCode}`,
                  });

                  if (config.get("verificationCodes.autoMarkAsRead")) {
                    this.renderer.send(
                      event.sender,
                      "gmail.handleMessage",
                      mail.messageId,
                      "markAsRead",
                    );
                  }

                  if (config.get("verificationCodes.autoDelete")) {
                    this.renderer.send(
                      event.sender,
                      "gmail.handleMessage",
                      mail.messageId,
                      "delete",
                    );
                  }

                  continue;
                }
              }

              if (!config.get("notifications.enabled") || !account.config.notifications) {
                continue;
              }

              createNotification({
                title: config.get("notifications.showSender")
                  ? mail.sender.name
                  : account.config.label,
                subtitle,
                body,
                actions: [
                  {
                    text: "Archive",
                    type: "button",
                  },
                  {
                    text: "Mark as read",
                    type: "button",
                  },
                  {
                    text: "Delete",
                    type: "button",
                  },
                  {
                    text: "Mark as spam",
                    type: "button",
                  },
                ],
                click: () => {
                  main.show();

                  accounts.selectAccount(accountId);

                  this.renderer.send(event.sender, "gmail.openMessage", mail.messageId);
                },
                action: (index) => {
                  switch (index) {
                    case 0: {
                      this.renderer.send(
                        event.sender,
                        "gmail.handleMessage",
                        mail.messageId,
                        "archive",
                      );

                      break;
                    }
                    case 1: {
                      this.renderer.send(
                        event.sender,
                        "gmail.handleMessage",
                        mail.messageId,
                        "markAsRead",
                      );

                      break;
                    }
                    case 2: {
                      this.renderer.send(
                        event.sender,
                        "gmail.handleMessage",
                        mail.messageId,
                        "delete",
                      );

                      break;
                    }
                    case 3: {
                      this.renderer.send(
                        event.sender,
                        "gmail.handleMessage",
                        mail.messageId,
                        "markAsSpam",
                      );

                      break;
                    }
                  }
                },
              });

              continue;
            }
          }
        }
      });
    }

    ipc.main.handle("downloads.openFile", async (_event, filePath) => {
      const error = await shell.openPath(filePath);

      return {
        error: error ? (fs.existsSync(filePath) ? error : "File does not exist") : null,
      };
    });

    ipc.main.handle("downloads.showFileInFolder", (_event, filePath) => {
      if (!fs.existsSync(filePath)) {
        return {
          error: "File does not exist",
        };
      }

      shell.showItemInFolder(filePath);

      return { error: null };
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

    ipc.main.handle("config.getConfig", () => config.store);

    ipc.main.handle("config.setConfig", (_event, keyValues) => {
      Object.entries(keyValues).forEach(([key, value]) => {
        config.set(key as keyof typeof keyValues, value);
      });
    });

    config.onDidAnyChange(() => {
      for (const browserWindow of BrowserWindow.getAllWindows()) {
        ipc.renderer.send(browserWindow.webContents, "config.configChanged", config.store);
      }
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

    ipc.main.on("notifications.showTestNotification", () => {
      createNotification({
        title: "Tim from Meru",
        subtitle: "Your Test Notification Request",
        body: "This is a test notification to show how notifications will appear.",
      });
    });

    ipc.main.on("googleApps.openApp", (_event, app) => {
      accounts.getSelectedAccount().instance.gmail.openGoogleApp(app);
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

    ipc.main.on("gmail.openUserStylesInEditor", () => {
      if (!fs.existsSync(GMAIL_USER_STYLES_PATH)) {
        fs.closeSync(fs.openSync(GMAIL_USER_STYLES_PATH, "w"));
      }

      shell.openPath(GMAIL_USER_STYLES_PATH);
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
      for (const accountInstance of accounts.instances.values()) {
        for (const window of accountInstance.windows) {
          if (window instanceof BrowserWindow && window.webContents.id === event.sender.id) {
            window.hide();

            const browserWindowId = window.id;

            window.once("closed", () => {
              ipc.renderer.send(
                accountInstance.gmail.view.webContents,
                "gmail.dismissMessageSentNotification",
                browserWindowId,
              );
            });

            ipc.renderer.send(
              accountInstance.gmail.view.webContents,
              "gmail.showMessageSentNotification",
              browserWindowId,
            );

            return;
          }
        }
      }
    });

    ipc.main.on("gmail.undoMessageSent", (_event, browserWindowId) => {
      const composeWindow = BrowserWindow.fromId(browserWindowId);

      if (!composeWindow) {
        throw new Error('Could not find compose window with the given "browserWindowId"');
      }

      composeWindow.show();

      ipc.renderer.send(composeWindow.webContents, "gmail.undoMessageSent");
    });

    ipc.main.on("gmail.setUserEmail", (event, email) => {
      for (const accountInstance of accounts.instances.values()) {
        if (accountInstance.gmail.view.webContents.id === event.sender.id) {
          accountInstance.gmail.userEmail = email;

          return;
        }
      }
    });

    ipc.main.handle("downloads.dragFile", (event, filePath) => {
      event.sender.startDrag({
        file: filePath,
        icon: nativeImage.createFromDataURL(
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAAJRJREFUeAHtleEJgCAQhY8maIRWbILaoDZwtNpAN3gpGImU3inYHx+cCL53n4ogUWsBWGxp5OU8ytYkab5BroMNwbPzKeMLm/Mhd4rrc01FECnAz2PIyApyAS8QxQ4mfKlXpkPvQGWabZ0fa/VXJMmXnoCtDuiADvgBYNwAyTfoFWRMyrSiXjtldrKD9+nHcpmVWusCljS3BE1jBC0AAAAASUVORK5CYII=",
        ),
      });
    });

    ipc.main.on("downloads.openPopup", () => {
      const popupWindow = new BrowserWindow({
        title: "Download History",
        width: 640,
        height: 480,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "renderer-preload", "index.js"),
        },
      });

      const searchParams = new URLSearchParams();

      searchParams.set("darkMode", nativeTheme.shouldUseDarkColors ? "true" : "false");

      const hash = "download-history";

      if (is.dev) {
        popupWindow.webContents.loadURL(`http://localhost:3001/?${searchParams}#${hash}`);

        popupWindow.webContents.openDevTools({
          mode: "detach",
        });
      } else {
        popupWindow.webContents.loadFile(path.join("build-js", "renderer-popup", "index.html"), {
          hash,
          search: searchParams.toString(),
        });
      }
    });
  }
}

export const ipc = new Ipc();
