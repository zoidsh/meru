import fs from "node:fs";
import path from "node:path";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
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
import { createNotification } from "./notifications";
import { MAILTO_PROTOCOL } from "./protocol";
import { appUpdater } from "./updater";
import { downloads } from "./downloads";
import { MAX_RECENT_DOWNLOAD_HISTORY_ITEMS } from "@meru/shared/constants";
import { fileExists } from "./lib/fs";

class Ipc {
  main = new IpcListener<IpcMainEvents>();

  renderer = new IpcEmitter<IpcRendererEvent>();

  init() {
    this.main.on("settings.toggleIsOpen", (_event, open) => {
      if (typeof open === "boolean") {
        appState.setIsSettingsOpen(open);
      } else {
        appState.toggleIsSettingsOpen();
      }

      if (appState.isSettingsOpen) {
        accounts.hide();
      } else {
        accounts.show();
      }
    });

    config.onDidAnyChange(() => {
      ipc.renderer.send(main.window.webContents, "config.configChanged", config.store);

      if (downloads.recentDownloadHistoryPopup) {
        ipc.renderer.send(
          downloads.recentDownloadHistoryPopup.webContents,
          "config.configChanged",
          config.store,
        );
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

    ipc.main.on("downloads.openFile", async (_event, { id, filePath }) => {
      if (!(await fileExists(filePath))) {
        const downloadHistory = config.get("downloads.history");

        for (const item of downloadHistory) {
          if (item.id === id) {
            item.exists = false;

            break;
          }
        }

        config.set("downloads.history", downloadHistory);

        return;
      }

      shell.openPath(filePath);
    });

    ipc.main.on("downloads.showFileInFolder", async (_event, { id, filePath }) => {
      if (!(await fileExists(filePath))) {
        const downloadHistory = config.get("downloads.history");

        for (const item of downloadHistory) {
          if (item.id === id) {
            item.exists = false;

            break;
          }
        }

        config.set("downloads.history", downloadHistory);

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

    ipc.main.handle("config.getConfig", () => config.store);

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

    ipc.main.on("downloads.dragFile", async (event, { id, filePath }) => {
      if (!(await fileExists(filePath))) {
        const downloadHistory = config.get("downloads.history");

        for (const item of downloadHistory) {
          if (item.id === id) {
            item.exists = false;

            break;
          }
        }

        config.set("downloads.history", downloadHistory);

        return;
      }

      event.sender.startDrag({
        file: filePath,
        icon: nativeImage.createFromDataURL(
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAABFklEQVR4nN3RzysEcRjH8afd1kE5ODg4ODgoBwcHRSFEfs0f4V9x9D+478HZqCmllB+llFLYqG1mWzTM0jhY6vtWa5GDnhnPiXe9Ls/38Dl8Rf5d3j3LXoPIa8CPEpyXcOElrOQemI+JFu4gs5jVXAOzt6CpNKGcwtzH7Ya1zAPTddA8vLqWjdQx075N1TOOTESgiV/cp/KjY7J9H69l+JOxKmium+6b9cS17qNVztWBkSvQ7KeO6PnLwZN7f7vEqQPDFbAQraEzsBCtwVOwEK2BE7AQrf5jsBCtviOwEK3eQ7AQrZ49sBCt7l2wEK2uHbAQrc5tsBCtUkDUEcBvlAJCdaDos1TwCQtbkItPWNxkUR34c70BSSmcO++HIKkAAAAASUVORK5CYII=",
        ),
      });
    });

    ipc.main.on("downloads.toggleRecentDownloadHistoryPopup", () => {
      if (downloads.toggleRecentDownloadHistoryPopup()) {
        downloads.checkDownloadHistoryItems(MAX_RECENT_DOWNLOAD_HISTORY_ITEMS);
      }
    });

    ipc.main.on("downloads.closeRecentDownloadHistoryPopup", () => {
      downloads.closeRecentDownloadHistoryPopup();
    });

    ipc.main.on("downloads.setDownloadHistoryPopupOnBlurEnabled", (_event, enabled) => {
      downloads.downloadHistoryPopupOnBlurEnabled = enabled;
    });

    ipc.main.on("downloads.openDownloadHistory", () => {
      main.navigate("/download-history");

      downloads.checkDownloadHistoryItems();
    });

    this.main.on("gmail.unreadCountChanged", (event, unreadCountString, inboxType) => {
      let unreadCount = 0;

      const parsedUnreadCountString = unreadCountString
        .split(":")
        .map((count) => Number(count.replace(/\D/g, "")) || 0);

      const unreadCountPreference = config.get("gmail.unreadCountPreference");

      if (parsedUnreadCountString.length === 2 && unreadCountPreference !== "default") {
        unreadCount =
          parsedUnreadCountString[unreadCountPreference === "first-section" ? 0 : 1] || 0;
      } else {
        unreadCount = parsedUnreadCountString.reduce((total, count) => total + count, 0);
      }

      for (const account of accounts.instances.values()) {
        if (event.sender.id === account.gmail.view.webContents.id) {
          account.gmail.setUnreadCount(unreadCount);

          account.gmail.fetchInboxFeed(inboxType, unreadCount);

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
