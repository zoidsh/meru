import { BrowserWindow, app, nativeTheme } from "electron";
import { is } from "electron-util";
import path from "node:path";

export class Main {
	window: BrowserWindow;

	title = "";

	ready: Promise<void>;

	listeners = {
		titleChanged: new Set<(title: string) => void>(),
	};

	constructor() {
		this.window = new BrowserWindow({
			title: app.name,
			minWidth: 912,
			width: 1280,
			minHeight: 512,
			height: 800,
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

		this.ready = new Promise<void>((resolve) => {
			this.window.webContents.once("dom-ready", resolve);
		});

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

	async whenReady() {
		await this.ready;

		return this;
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
}
