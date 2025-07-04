import path from "node:path";
import { is } from "@electron-toolkit/utils";
import { GOOGLE_MEET_URL } from "@meru/shared/constants";
import type { AccountConfig } from "@meru/shared/schemas";
import type { SelectedDesktopSource } from "@meru/shared/types";
import {
	BrowserWindow,
	type IpcMainEvent,
	ipcMain,
	nativeTheme,
	type Session,
	session,
	type WebContentsView,
} from "electron";
import { blocker } from "./blocker";
import { config } from "./config";
import { Gmail } from "./gmail";

export class Account {
	session: Session;

	gmail: Gmail;

	windows: Set<BrowserWindow | WebContentsView> = new Set();

	constructor(accountConfig: AccountConfig) {
		this.session = session.fromPartition(`persist:${accountConfig.id}`);

		this.registerSessionPermissionsRequestsHandler();

		this.registerSessionDisplayMediaRequestHandler();

		blocker.setupSession(this.session);

		this.gmail = new Gmail({
			accountId: accountConfig.id,
			session: this.session,
			unreadCountEnabled: accountConfig.unreadBadge,
		});
	}

	private registerSessionPermissionsRequestsHandler() {
		this.session.setPermissionRequestHandler(
			(_webContents, permission, callback) => {
				switch (permission) {
					case "clipboard-sanitized-write":
					case "media": {
						callback(true);
						break;
					}
					case "notifications": {
						callback(config.get("notifications.allowFromGoogleApps"));
						break;
					}
				}
			},
		);
	}

	private registerSessionDisplayMediaRequestHandler() {
		this.session.setDisplayMediaRequestHandler(
			async (_request, callback) => {
				const googleMeetApp = Array.from(this.windows).find((window) =>
					window.webContents.getURL().startsWith(GOOGLE_MEET_URL),
				);

				if (!googleMeetApp) {
					callback({});

					return;
				}

				const desktopSourcesWindow = new BrowserWindow({
					title: "Choose what to share",
					parent:
						googleMeetApp instanceof BrowserWindow ? googleMeetApp : undefined,
					width: 576,
					height: 512,
					resizable: false,
					autoHideMenuBar: true,
					webPreferences: {
						preload: path.join(__dirname, "renderer-preload", "index.js"),
					},
				});

				const windowEvent = "closed";

				const ipcEvent = "desktopSources.select";

				const ipcListener = (
					_event: IpcMainEvent,
					desktopSource: SelectedDesktopSource,
				) => {
					desktopSourcesWindow.removeListener(windowEvent, windowListener);

					callback({ video: desktopSource });

					desktopSourcesWindow.destroy();
				};

				const windowListener = () => {
					ipcMain.removeListener(ipcEvent, ipcListener);

					callback({});

					desktopSourcesWindow.destroy();
				};

				ipcMain.once(ipcEvent, ipcListener);

				desktopSourcesWindow.once(windowEvent, windowListener);

				const searchParams = new URLSearchParams();

				searchParams.set(
					"darkMode",
					nativeTheme.shouldUseDarkColors ? "true" : "false",
				);

				if (is.dev) {
					desktopSourcesWindow.webContents.loadURL(
						`http://localhost:3001/?${searchParams}`,
					);

					desktopSourcesWindow.webContents.openDevTools({
						mode: "detach",
					});
				} else {
					desktopSourcesWindow.webContents.loadFile(
						path.join("build-js", "desktop-sources", "index.html"),
						{ search: searchParams.toString() },
					);
				}
			},
			{ useSystemPicker: config.get("screenShare.useSystemPicker") },
		);
	}
}
