import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import Electron, { nativeTheme } from "electron";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { main } from "@/main";
import { appState } from "./state";

export class AppTray {
  private tray: Electron.Tray | undefined;

  private contextMenu: Electron.Menu | undefined;

  private icon: Electron.NativeImage | undefined;
  private iconUnread: Electron.NativeImage | undefined;

  init() {
    if (config.get("tray.enabled")) {
      this.icon = this.createIcon();

      if (!platform.isMacOS) {
        this.iconUnread = this.createIcon(true);
      }

      this.tray = new Electron.Tray(this.icon);

      this.tray.setToolTip(Electron.app.name);

      this.createOrUpdateContextMenu();

      this.tray.on("click", () => {
        this.toggleWindow();
      });

      this.tray.on("right-click", () => {
        this.tray?.popUpContextMenu(this.contextMenu);
      });

      config.onDidChange("accounts", () => {
        this.createOrUpdateContextMenu();
      });

      main.window.on("hide", () => {
        this.createOrUpdateContextMenu();
      });

      main.window.on("show", () => {
        this.createOrUpdateContextMenu();
      });
    }
  }

  toggleWindow() {
    if (main.window.isVisible()) {
      main.window.hide();
    } else {
      if (config.get("tray.selectAccountWithUnread")) {
        const accountWithUnread = accounts.getFirstAccountWithUnread();

        if (accountWithUnread) {
          accounts.selectAccount(accountWithUnread.id);

          appState.setIsSettingsOpen(false);
        }
      }

      main.show();
    }
  }

  createIcon(unread = false): Electron.NativeImage {
    let iconFileName: string;

    if (platform.isMacOS) {
      iconFileName = "IconMenuBarTemplate.png";
    } else {
      const iconColor = config.get("tray.iconColor");

      iconFileName = `IconTray${unread ? "Unread" : ""}-${iconColor === "system" ? (nativeTheme.shouldUseDarkColors ? "Light" : "Dark") : `${iconColor[0]?.toUpperCase()}${iconColor.slice(1)}`}.${platform.isWindows ? "ico" : "png"}`;
    }

    const image = Electron.nativeImage.createFromPath(
      path.join(__dirname, "..", "static", iconFileName),
    );

    if (platform.isMacOS) {
      image.setTemplateImage(true);
    }

    return image;
  }

  updateIcon() {
    if (this.tray && !platform.isMacOS) {
      this.icon = this.createIcon();

      const unreadCount = accounts.getTotalUnreadCount();

      if (!unreadCount) {
        this.tray.setImage(this.icon);
      }
    }
  }

  createOrUpdateContextMenu() {
    this.contextMenu = Electron.Menu.buildFromTemplate(this.getMenuTemplate());

    if (platform.isLinux && this.tray) {
      this.tray.setContextMenu(this.contextMenu);
    }
  }

  updateUnreadStatus(unreadCount: number) {
    if (this.tray) {
      if (this.icon && this.iconUnread) {
        this.tray.setImage(unreadCount ? this.iconUnread : this.icon);
      }

      if (platform.isMacOS) {
        const trayUnreadCount = config.get("tray.unreadCount");

        if (trayUnreadCount) {
          this.tray.setTitle(unreadCount ? unreadCount.toString() : "");
        }
      }
    }

    this.createOrUpdateContextMenu();
  }

  getMenuTemplate() {
    const mainWindowIsVisible = main.window.isVisible();

    const trayMenuTemplate: Electron.MenuItemConstructorOptions[] = [
      ...accounts.getAccounts().map(({ config, instance }) => {
        const unreadCount = instance.gmail.store.getState().unreadCount;

        return {
          label: unreadCount ? `${config.label} (${unreadCount})` : config.label,
          click: () => {
            accounts.selectAccount(config.id);

            main.show();
          },
        };
      }),
      {
        type: "separator",
      },
      {
        label: mainWindowIsVisible ? "Hide" : "Show",
        click: () => {
          main.window[mainWindowIsVisible ? "hide" : "show"]();
        },
      },
      {
        type: "separator",
      },
      {
        role: "quit",
      },
    ];

    return trayMenuTemplate;
  }
}

export const appTray = new AppTray();
