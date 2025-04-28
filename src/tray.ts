import path from "node:path";
import { config } from "@/lib/config";
import { platform } from "@electron-toolkit/utils";
import Electron, { nativeTheme } from "electron";
import { accounts } from "./accounts";
import { main } from "./main";

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

			this._tray.on("click", () => {
				main.show();
			});

			this._menu = Electron.Menu.buildFromTemplate(this.getMenuTemplate());

			this._tray.setContextMenu(this._menu);

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
				: `IconTray-${iconColor === "system" ? (nativeTheme.shouldUseDarkColors ? "Light" : "Dark") : `${iconColor[0].toUpperCase()}${iconColor.slice(1)}`}.png`;
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

	updateMenu() {
		if (this._tray) {
			this._menu = Electron.Menu.buildFromTemplate(this.getMenuTemplate());

			this._tray.setContextMenu(this._menu);
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

			this._tray.setContextMenu(this._menu);
		}
	}

	updateUnreadStatus(unreadCount: number) {
		if (this._tray) {
			if (this._icon && this._iconUnread) {
				this._tray.setImage(unreadCount ? this._iconUnread : this._icon);
			}

			if (platform.isMacOS) {
				this._tray.setTitle(unreadCount ? unreadCount.toString() : "");
			}
		}
	}

	getMenuTemplate() {
		const macosMenuItems: Electron.MenuItemConstructorOptions[] = [];

		if (platform.isMacOS) {
			macosMenuItems.push(
				{
					label: "Show Dock Icon",
					type: "checkbox",
					checked: config.get("showDockIcon"),
					click: ({ checked }: { checked: boolean }) => {
						if (this._menu && Electron.app.dock) {
							config.set("showDockIcon", checked);

							if (checked) {
								Electron.app.dock.show();
							} else {
								Electron.app.dock.hide();
							}

							this.updateMenu();
						}
					},
				},
				{
					type: "separator",
				},
			);

			const applicationMenu = Electron.Menu.getApplicationMenu();

			if (applicationMenu) {
				macosMenuItems.push({
					label: "Menu",
					visible: !config.get("showDockIcon"),
					submenu: applicationMenu,
				});
			}
		}

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
				click: () => {
					main.show();
				},
				label: "Show",
				visible: main.shouldLaunchMinimized(),
				id: "show-win",
			},
			{
				label: "Hide",
				visible: !main.shouldLaunchMinimized(),
				click: () => {
					main.window.hide();
				},
				id: "hide-win",
			},
			...macosMenuItems,
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
