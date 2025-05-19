import path from "node:path";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { main } from "@/main";
import { platform } from "@electron-toolkit/utils";
import Electron, { nativeTheme } from "electron";

export class AppTray {
	private _tray: Electron.Tray | undefined;

	private _menu: Electron.Menu | undefined;

	private _icon: Electron.NativeImage | undefined;
	private _iconUnread: Electron.NativeImage | undefined;

	init() {
		if (config.get("tray.enabled")) {
			this._icon = this.createIcon();

			if (!platform.isMacOS) {
				this._iconUnread = this.createIcon(true);
			}

			this._tray = new Electron.Tray(this._icon);

			this._tray.setToolTip(Electron.app.name);

			this._menu = Electron.Menu.buildFromTemplate(this.getMenuTemplate());

			if (platform.isLinux) {
				this._tray.setContextMenu(this._menu);
			} else {
				this._tray.on("click", () => {
					main.show();
				});

				this._tray.on("right-click", () => {
					this._tray?.popUpContextMenu(this._menu);
				});
			}

			main.window.on("closed", () => {
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

			iconFileName = unread
				? "IconTrayUnread.png"
				: `IconTray-${iconColor === "system" ? (nativeTheme.shouldUseDarkColors ? "Light" : "Dark") : `${iconColor[0]?.toUpperCase()}${iconColor.slice(1)}`}.png`;
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
		if (this._tray && !platform.isMacOS) {
			this._icon = this.createIcon();

			const unreadCount = accounts.getTotalUnreadCount();

			if (!unreadCount) {
				this._tray.setImage(this._icon);
			}
		}
	}

	updateWindowVisibilityMenuItem() {
		if (this._tray && this._menu) {
			const showWindowMenuItem = this._menu.getMenuItemById("show-win");

			if (showWindowMenuItem) {
				showWindowMenuItem.visible = !main.window.isVisible();
			}

			const hideWindowMenuItem = this._menu.getMenuItemById("hide-win");

			if (hideWindowMenuItem) {
				hideWindowMenuItem.visible = main.window.isVisible();
			}
		}
	}

	updateUnreadStatus(unreadCount: number) {
		if (this._tray) {
			if (this._icon && this._iconUnread) {
				this._tray.setImage(unreadCount ? this._iconUnread : this._icon);
			}

			if (platform.isMacOS) {
				const trayUnreadCount = config.get("tray.unreadCount");

				if (trayUnreadCount) {
					this._tray.setTitle(unreadCount ? unreadCount.toString() : "");
				}
			}
		}
	}

	getMenuTemplate() {
		const trayMenuTemplate: Electron.MenuItemConstructorOptions[] = [
			...accounts.getAccountConfigs().map((accountConfig) => ({
				label: accountConfig.label,
				click: () => {
					accounts.selectAccount(accountConfig.id);

					main.show();
				},
			})),
			{
				type: "separator",
			},
			{
				label: "Show",
				visible: main.shouldLaunchMinimized(),
				id: "show-win",
				click: () => {
					main.show();
				},
			},
			{
				label: "Hide",
				visible: !main.shouldLaunchMinimized(),
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
