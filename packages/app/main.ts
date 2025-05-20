import path from "node:path";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { appState } from "@/state";
import { openExternalUrl } from "@/url";
import { is, platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import { BrowserWindow, app, nativeTheme } from "electron";
import { trial } from "./trial";

class Main {
	private _window: BrowserWindow | undefined;

	get window() {
		if (!this._window) {
			throw new Error("Window has not been initialized");
		}

		return this._window;
	}

	set window(browserWindow: BrowserWindow) {
		this._window = browserWindow;
	}

	shouldLaunchMinimized() {
		return (
			app.commandLine.hasSwitch("launch-minimized") ||
			config.get("launchMinimized")
		);
	}

	loadURL() {
		const searchParams = new URLSearchParams();

		searchParams.set(
			"darkMode",
			nativeTheme.shouldUseDarkColors ? "true" : "false",
		);

		searchParams.set(
			"accounts",
			JSON.stringify(
				accounts.getAccounts().map((account) => ({
					config: account.config,
					gmail: account.gmail.state,
				})),
			),
		);

		searchParams.set(
			"accountsUnreadBadge",
			JSON.stringify(config.get("accounts.unreadBadge")),
		);

		const licenseKey = config.get("licenseKey");

		if (licenseKey) {
			searchParams.set("licenseKey", JSON.stringify(licenseKey));
		}

		if (trial.daysLeft) {
			searchParams.set("trialDaysLeft", JSON.stringify(trial.daysLeft));
		}

		if (is.dev) {
			this.window.webContents.loadURL(
				`http://localhost:3000/?${searchParams.toString()}`,
			);

			this.window.webContents.openDevTools({
				mode: "detach",
			});
		} else {
			this.window.webContents.loadFile(
				path.join("build-js", "renderer", "index.html"),
				{ search: searchParams.toString() },
			);
		}
	}

	getTitlebarOverlayOptions() {
		return {
			color: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
			symbolColor: nativeTheme.shouldUseDarkColors ? "#fafafa" : "#0a0a0a",
			height: APP_TITLEBAR_HEIGHT - 1,
		};
	}

	updateTitlebarOverlay() {
		if (!platform.isMacOS) {
			this.window.setTitleBarOverlay(this.getTitlebarOverlayOptions());
		}
	}

	init() {
		const lastWindowState = config.get("window.lastState");
		const restrictWindowMinimumSize = config.get("window.restrictMinimumSize");

		this.window = new BrowserWindow({
			title: app.name,
			minWidth: restrictWindowMinimumSize ? 912 : 320,
			width: lastWindowState.bounds.width,
			minHeight: restrictWindowMinimumSize ? 512 : 256,
			height: lastWindowState.bounds.height,
			x: lastWindowState.bounds.x,
			y: lastWindowState.bounds.y,
			show: false,
			titleBarStyle: platform.isMacOS ? "hiddenInset" : "hidden",
			titleBarOverlay: this.getTitlebarOverlayOptions(),
			darkTheme: nativeTheme.shouldUseDarkColors,
			webPreferences: {
				preload: path.join(__dirname, "renderer-preload", "index.js"),
			},
			icon: platform.isLinux
				? path.join(__dirname, "..", "static", "Icon.png")
				: undefined,
		});

		if (!this.shouldLaunchMinimized()) {
			this.window.once("ready-to-show", () => {
				this.show();
			});

			if (lastWindowState.fullscreen) {
				this.window.setFullScreen(true);
			}

			if (lastWindowState.maximized) {
				this.window.maximize();
			}
		}

		this.window.webContents.setWindowOpenHandler(({ url }) => {
			openExternalUrl(url, true);

			return {
				action: "deny",
			};
		});

		this.window.on("close", (event) => {
			// Workaround: Closing the main window when on full screen leaves a black screen
			// https://github.com/electron/electron/issues/20263
			if (platform.isMacOS && this.window.isFullScreen()) {
				this.window.once("leave-full-screen", () => {
					this.window.hide();
				});

				this.window.setFullScreen(false);
			}

			if (!appState.isQuittingApp) {
				event.preventDefault();

				this.window.blur();

				this.window.hide();

				if (!config.get("dock.enabled")) {
					app.dock?.hide();
				}
			}
		});
	}

	show() {
		if (this.window.isMinimized()) {
			this.window.restore();
		} else {
			this.window.show();
		}

		if (app.dock?.isVisible) {
			app.dock.show();
		}
	}
}

export const main = new Main();
