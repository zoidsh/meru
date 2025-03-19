import path from "node:path";
import type { Gmail } from "@/gmail";
import { config } from "@/lib/config";
import { platform } from "@electron-toolkit/utils";
import Electron from "electron";
import { Main } from "./main";

export class Tray {
	tray: Electron.Tray | undefined;

	icon: Electron.NativeImage | undefined;
	iconUnread: Electron.NativeImage | undefined;

	menu: Electron.Menu | undefined;

	main: Main;
	gmail: Gmail;

	constructor({ main, gmail }: { main: Main; gmail: Gmail }) {
		this.main = main;
		this.gmail = gmail;

		if (config.get("trayIconEnabled")) {
			this.icon = this.createIcon(false);
			this.iconUnread = this.createIcon(true);

			this.tray = new Electron.Tray(this.icon);

			this.tray.setToolTip(Electron.app.name);

			this.tray.on("click", () => {
				this.main.show();
			});

			this.menu = Electron.Menu.buildFromTemplate(this.getMenuTemplate());

			this.tray.setContextMenu(this.menu);

			this.main.window.on("hide", () => {
				this.updateWindowVisibilityMenuItem("show");
			});

			this.main.window.on("show", () => {
				this.updateWindowVisibilityMenuItem("hide");
			});
		}
	}

	createIcon(unread: boolean): Electron.NativeImage {
		const iconFileName = platform.isMacOS
			? "tray-icon.macos.Template.png"
			: unread
				? "tray-icon-unread.png"
				: "tray-icon.png";

		return Electron.nativeImage.createFromPath(
			path.join(__dirname, "..", "static", iconFileName),
		);
	}

	updateMenu() {
		if (this.tray) {
			this.menu = Electron.Menu.buildFromTemplate(this.getMenuTemplate());

			this.tray.setContextMenu(this.menu);
		}
	}

	updateWindowVisibilityMenuItem(visibility: "show" | "hide") {
		if (this.tray && this.menu) {
			const showWindowMenuItem = this.menu.getMenuItemById("show-win");

			if (showWindowMenuItem) {
				showWindowMenuItem.visible = !this.main.window.isVisible();
			}

			const hideWindowMenuItem = this.menu.getMenuItemById("hide-win");

			if (hideWindowMenuItem) {
				hideWindowMenuItem.visible = this.main.window.isVisible();
			}

			this.tray.setContextMenu(this.menu);
		}
	}

	updateUnreadStatus(unreadCount: number) {
		if (this.tray && this.icon && this.iconUnread) {
			this.tray.setImage(unreadCount ? this.iconUnread : this.icon);

			if (platform.isMacOS) {
				this.tray.setTitle(unreadCount ? unreadCount.toString() : "");
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
						if (this.menu) {
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
			...config.get("accounts").map((account) => ({
				label: account.label,
				click: () => {
					this.gmail.selectView(account);
					this.main.show();
				},
			})),
			{
				type: "separator",
			},
			{
				click: () => {
					this.main.show();
				},
				label: "Show",
				visible: Main.shouldLaunchMinimized(),
				id: "show-win",
			},
			{
				label: "Hide",
				visible: !Main.shouldLaunchMinimized(),
				click: () => {
					this.main.window.hide();
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
