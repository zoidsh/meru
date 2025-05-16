import { accounts } from "@/accounts";
import { blocker } from "@/blocker";
import { config } from "@/config";
import { initDownloads } from "@/downloads";
import { initIpc } from "@/ipc";
import { validateLicenseKey } from "@/license-key";
import { main } from "@/main";
import { appMenu } from "@/menu";
import { appState } from "@/state";
import { initTheme } from "@/theme";
import { appTray } from "@/tray";
import { appUpdater } from "@/updater";
import { platform } from "@electron-toolkit/utils";
import { APP_ID } from "@meru/shared/constants";
import { app } from "electron";
import { handleMailto, mailtoUrlArg } from "./mailto";

(async () => {
	app.setAppUserModelId(APP_ID);

	if (!app.requestSingleInstanceLock()) {
		app.quit();

		return;
	}

	if (config.get("hardwareAcceleration") === false) {
		app.disableHardwareAcceleration();
	}

	if (config.get("resetConfig")) {
		config.clear();

		app.relaunch();

		app.quit();

		return;
	}

	if ((await validateLicenseKey()) === "failed") {
		app.quit();

		return;
	}

	await Promise.all([app.whenReady(), blocker.init()]);

	initDownloads();

	initTheme();

	main.init();

	accounts.init();

	main.loadURL();

	initIpc();

	appMenu.init();

	appTray.init();

	appUpdater.init();

	if (mailtoUrlArg) {
		handleMailto(mailtoUrlArg);
	}

	app.on("second-instance", (_event, argv) => {
		main.show();

		if (!platform.isMacOS && appState.isValidLicenseKey) {
			const mailtoUrlArg = argv.find((arg) => arg.startsWith("mailto:"));

			if (mailtoUrlArg) {
				handleMailto(mailtoUrlArg);
			}
		}
	});

	app.on("activate", () => {
		main.show();
	});

	if (platform.isMacOS && appState.isValidLicenseKey) {
		app.on("open-url", async (_event, url) => {
			handleMailto(url);
		});
	}

	main.window.on("focus", () => {
		if (!appState.isSettingsOpen) {
			accounts.getSelectedAccount().gmail.view.webContents.focus();
		}
	});

	app.on("before-quit", () => {
		appState.isQuittingApp = true;

		config.set("lastWindowState", {
			bounds: main.window.getBounds(),
			fullscreen: main.window.isFullScreen(),
			maximized: main.window.isMaximized(),
		});
	});
})();
