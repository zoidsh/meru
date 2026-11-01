import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { t } from "@lingui/core/macro";
import { getAccountLabel } from "@meru/shared/accounts";
import { byPlatform } from "@meru/shared/platform";
import Electron, { nativeTheme } from "electron";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { main } from "@/main";

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

          main.navigate("/");
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

      const iconFileNameState = unread ? "Unread" : "";

      const iconFileNameColor =
        iconColor === "system"
          ? nativeTheme.shouldUseDarkColors
            ? "Light"
            : "Dark"
          : `${iconColor[0]?.toUpperCase()}${iconColor.slice(1)}`;

      iconFileName = `IconTray${iconFileNameState}-${iconFileNameColor}.${platform.isWindows ? "ico" : "png"}`;
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

  private getQuitLabel() {
    const appName = Electron.app.name;

    return byPlatform(platform, {
      macOS: t({ message: `Quit ${appName}`, context: "macOS" }),
      windows: t({
        message: "Exit",
        context: "Windows",
        comment: "Tray menu item that quits Meru",
      }),
      linux: t({ message: "Quit", context: "Linux", comment: "Tray menu item that quits Meru" }),
    });
  }

  private getHideLabel() {
    // lingui-set comment="Tray menu item that hides Meru's window"
    return byPlatform(platform, {
      macOS: t({ message: "Hide Meru", context: "macOS" }),
      windows: t({ message: "Hide Meru", context: "Windows" }),
      linux: t({ message: "Hide Meru", context: "Linux" }),
    });
    // lingui-reset
  }

  private getShowLabel() {
    // lingui-set comment="Tray menu item that brings Meru's window back"
    return byPlatform(platform, {
      macOS: t({ message: "Show Meru", context: "macOS" }),
      windows: t({ message: "Show Meru", context: "Windows" }),
      linux: t({ message: "Show Meru", context: "Linux" }),
    });
    // lingui-reset
  }

  getMenuTemplate() {
    const mainWindowIsVisible = main.window.isVisible();

    const trayMenuTemplate: Electron.MenuItemConstructorOptions[] = [
      ...accounts.getAccounts().map(({ config, instance }) => {
        const unreadCount = instance.gmail.store.getState().unreadCount;

        const label = getAccountLabel(config.label);

        return {
          label: unreadCount ? `${label} (${unreadCount})` : label,
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
        label: mainWindowIsVisible ? this.getHideLabel() : this.getShowLabel(),
        click: () => {
          main.window[mainWindowIsVisible ? "hide" : "show"]();
        },
      },
      {
        type: "separator",
      },
      {
        label: this.getQuitLabel(),
        role: "quit",
      },
    ];

    return trayMenuTemplate;
  }
}

export const appTray = new AppTray();
