import path from "node:path";
import { config } from "@/lib/config";
import { BrowserWindow, app, nativeTheme } from "electron";
import { is } from "electron-util";

export class Main {
	window: BrowserWindow;

	title = "";

	listeners = {
		titleChanged: new Set<(title: string) => void>(),
	};

	constructor() {
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
			fullscreen: lastWindowState.fullscreen,
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
			icon: is.linux ? path.join("assets", "icon.png") : undefined,
		});

		this.window.once("ready-to-show", () => {
			this.window.show();
		});

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
}
