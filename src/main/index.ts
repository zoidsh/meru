import path from "node:path";
import type { AppState } from "@/lib/app-state";
import { config } from "@/lib/config";
import { BrowserWindow, app, nativeTheme } from "electron";
import { is } from "electron-util";

export class Main {
	window: BrowserWindow;

	title = "";

	listeners = {
		titleChanged: new Set<(title: string) => void>(),
	};

	constructor({ appState }: { appState: AppState }) {
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
			titleBarStyle: "hiddenInset",
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
			icon: is.linux
				? path.join(__dirname, "..", "static", "icon.png")
				: undefined,
		});

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

		if (process.env.NODE_ENV === "production") {
			this.window.webContents.loadFile(
				path.join("out", "renderer", "index.html"),
			);
		} else {
			this.window.webContents.loadURL("http://localhost:3000");

			this.window.webContents.openDevTools({
				mode: "detach",
			});
		}

		if (!is.macos) {
			const autoHideMenuBar = config.get("autoHideMenuBar");

			this.window.setMenuBarVisibility(!autoHideMenuBar);

			this.window.autoHideMenuBar = autoHideMenuBar;
		}

		this.window.on("close", (event) => {
			// Workaround: Closing the main window when on full screen leaves a black screen
			// https://github.com/electron/electron/issues/20263
			if (is.macos && this.window.isFullScreen()) {
				this.window.once("leave-full-screen", () => {
					this.window.hide();
				});

				this.window.setFullScreen(false);
			}

			if (!appState.isQuitting) {
				event.preventDefault();

				this.window.blur();

				this.window.hide();
			}
		});
	}

	onTitleChanged(listener: (title: string) => void) {
		this.listeners.titleChanged.add(listener);

		return () => {
			this.listeners.titleChanged.delete(listener);
		};
	}

	emitTitleChanged(title: string) {
		for (const listener of this.listeners.titleChanged) {
			listener(title);
		}
	}

	setTitle(title: string) {
		this.title = title;

		this.emitTitleChanged(title);
	}

	show() {
		if (this.window.isMinimized()) {
			this.window.restore();
		} else {
			this.window.show();
		}
	}

	shouldLaunchMinimized() {
		return (
			app.commandLine.hasSwitch("launch-minimized") ||
			config.get("launchMinimized") ||
			app.getLoginItemSettings().wasOpenedAtLogin
		);
	}
}
