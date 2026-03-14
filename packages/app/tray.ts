import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import Electron, { nativeTheme } from "electron";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { main } from "@/main";

export class AppTray {
  private tray: Electron.Tray | undefined;

  private menu: Electron.Menu | undefined;

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

      this.menu = Electron.Menu.buildFromTemplate(this.getMenuTemplate());

      this.tray.setContextMenu(this.menu);

      this.tray.on("click", () => {
        if (main.window.isVisible() && !main.window.isMinimized()) {
          main.window.hide();
        } else {
          const accountWithUnread = accounts.getFirstAccountWithUnread();

          if (accountWithUnread) {
            accounts.selectAccount(accountWithUnread.id);
          }

          main.show();
        }
      });

      config.onDidChange("accounts", () => {
        this.updateWindowVisibilityMenuItem();
      });

      main.window.on("hide", () => {
        this.updateWindowVisibilityMenuItem();
      });

      main.window.on("show", () => {
        this.updateWindowVisibilityMenuItem();
      });
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

  updateWindowVisibilityMenuItem() {
    if (this.tray) {
      this.menu = Electron.Menu.buildFromTemplate(this.getMenuTemplate());
      this.tray.setContextMenu(this.menu);
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

    this.menu = Electron.Menu.buildFromTemplate(this.getMenuTemplate());
    this.tray?.setContextMenu(this.menu);
  }

  getMenuTemplate() {
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
        label: "Show",
        visible: !main.window.isVisible(),
        id: "show-win",
        click: () => {
          main.show();
        },
      },
      {
        label: "Hide",
        visible: main.window.isVisible(),
        id: "hide-win",
        click: () => {
          main.window.hide();
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
