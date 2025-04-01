import path from "node:path";
import { config } from "@/lib/config";
import { appState } from "@/state";
import { is, platform } from "@electron-toolkit/utils";
import { BrowserWindow, app, nativeTheme } from "electron";

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
			config.get("launchMinimized") ||
			app.getLoginItemSettings().wasOpenedAtLogin
		);
	}

	loadURL() {
		if (is.dev) {
			this.window.webContents.loadURL("http://localhost:3000");

			this.window.webContents.openDevTools({
				mode: "detach",
			});
		} else {
			this.window.webContents.loadFile(
				path.join("out", "renderer", "index.html"),
			);
		}
	}

	init() {
		const lastWindowState = config.get("lastWindowState");

		this.window = new BrowserWindow({
			title: app.name,
			minWidth: 912,
			width: lastWindowState.bounds.width,
			minHeight: 512,
			height: lastWindowState.bounds.height,
			x: lastWindowState.bounds.x,
			y: lastWindowState.bounds.y,
			show: false,
			titleBarStyle: platform.isMacOS ? "hiddenInset" : "hidden",
			darkTheme: nativeTheme.shouldUseDarkColors,
			webPreferences: {
				preload: path.join(
					...(process.env.NODE_ENV === "production"
						? [__dirname]
						: [process.cwd(), "out"]),
					"renderer",
					"preload.js",
				),
			},
			icon: platform.isLinux
				? path.join(__dirname, "..", "static", "icon.png")
				: undefined,
		});

		this.loadURL();

		if (!this.shouldLaunchMinimized()) {
			this.window.once("ready-to-show", () => {
				this.window.show();
			});
		}

		if (lastWindowState.fullscreen) {
			this.window.setFullScreen(true);
		}

		if (lastWindowState.maximized) {
			this.window.maximize();
		}

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
			}
		});
	}

	show() {
		if (this.window.isMinimized()) {
			this.window.restore();
		} else {
			this.window.show();
		}
	}
}

export const main = new Main();
