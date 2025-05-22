import path from "node:path";
import { is } from "@electron-toolkit/utils";
import { GOOGLE_ACCOUNTS_URL, GOOGLE_MEET_URL } from "@meru/shared/constants";
import { GMAIL_URL } from "@meru/shared/gmail";
import type { AccountConfig } from "@meru/shared/schemas";
import type { SelectedDesktopSource } from "@meru/shared/types";
import {
	BrowserWindow,
	type IpcMainEvent,
	type Session,
	WebContentsView,
	ipcMain,
	nativeTheme,
	session,
} from "electron";
import { accounts } from "./accounts";
import { blocker } from "./blocker";
import { config } from "./config";
import { setupWindowContextMenu } from "./context-menu";
import { Gmail } from "./gmail";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { appState } from "./state";
import { openExternalUrl } from "./url";

const WINDOW_OPEN_URL_WHITELIST = [
	/googleusercontent\.com\/viewer\/secure\/pdf/, // Print PDF
];

const SUPPORTED_GOOGLE_APPS_URL_REGEXP =
	/(calendar|docs|drive|meet|contacts)\.google\.com/;

const WINDOW_OPEN_DOWNLOAD_URL_WHITELIST = [
	/chat\.google\.com\/u\/\d\/api\/get_attachment_url/,
];

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
			session: this.session,
			unreadCountEnabled: accountConfig.unreadBadge,
		});

		this.registerWindowOpenHandler(this.gmail.view);
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
				const googleMeetApp = this.windows
					.values()
					.find((window) =>
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

	private registerWindowOpenHandler(window: BrowserWindow | WebContentsView) {
		window.webContents.setWindowOpenHandler(({ url, disposition }) => {
			if (url === "about:blank") {
				return {
					action: "allow",
					createWindow: (options) => {
						let view: WebContentsView | null = new WebContentsView(options);

						view.webContents.once("will-navigate", (_event, url) => {
							openExternalUrl(url);

							if (view) {
								view.webContents.close();

								view = null;
							}
						});

						return view.webContents;
					},
				};
			}

			const isSupportedGoogleApp = SUPPORTED_GOOGLE_APPS_URL_REGEXP.test(url);

			if (
				(url.startsWith(GMAIL_URL) ||
					WINDOW_OPEN_URL_WHITELIST.some((regex) => regex.test(url)) ||
					(isSupportedGoogleApp && licenseKey.isValid)) &&
				disposition !== "background-tab"
			) {
				if (isSupportedGoogleApp && this.windows.size > 0) {
					const urlHostname = new URL(url).hostname;

					for (const window of this.windows) {
						if (new URL(window.webContents.getURL()).hostname === urlHostname) {
							window.webContents.loadURL(url);

							window.webContents.focus();

							return {
								action: "deny",
							};
						}
					}
				}

				return {
					action: "allow",
					createWindow: (options) => {
						const window = new BrowserWindow({
							...options,
							autoHideMenuBar: true,
							width: 1280,
							height: 800,
						});

						this.registerWindowOpenHandler(window);

						setupWindowContextMenu(window);

						this.windows.add(window);

						window.once("closed", () => {
							this.windows.delete(window);
						});

						return window.webContents;
					},
				};
			}

			if (url.startsWith(`${GOOGLE_ACCOUNTS_URL}/AddSession`)) {
				appState.setIsSettingsOpen(true);

				accounts.hide();

				ipc.renderer.send(
					main.window.webContents,
					"accounts.openAddAccountDialog",
				);
			} else if (
				WINDOW_OPEN_DOWNLOAD_URL_WHITELIST.some((regex) => regex.test(url))
			) {
				window.webContents.downloadURL(url);
			} else {
				openExternalUrl(url);
			}

			return {
				action: "deny",
			};
		});
	}

	createGmailComposeWindow(url: string) {
		const window = new BrowserWindow({
			autoHideMenuBar: true,
			webPreferences: {
				session: this.session,
			},
		});

		setupWindowContextMenu(window);

		this.registerWindowOpenHandler(window);

		window.webContents.loadURL(
			`${GMAIL_URL}/?extsrc=mailto&url=${encodeURIComponent(url)}`,
		);

		window.once("ready-to-show", () => {
			window.focus();
		});
	}
}
