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

			if (platform.isLinux) {
				this.tray.setContextMenu(this.menu);
			} else {
				this.tray.on("click", () => {
					main.show();
				});

				this.tray.on("right-click", () => {
					this.tray?.popUpContextMenu(this.menu);
				});
			}

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
		if (this.tray && this.menu) {
			const showWindowMenuItem = this.menu.getMenuItemById("show-win");

			if (showWindowMenuItem) {
				showWindowMenuItem.visible = !main.window.isVisible();
			}

			const hideWindowMenuItem = this.menu.getMenuItemById("hide-win");

			if (hideWindowMenuItem) {
				hideWindowMenuItem.visible = main.window.isVisible();
			}
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
				visible: main.shouldLaunchMinimized,
				id: "show-win",
				click: () => {
					main.show();
				},
			},
			{
				label: "Hide",
				visible: !main.shouldLaunchMinimized,
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
