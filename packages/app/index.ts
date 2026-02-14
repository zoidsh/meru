import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { APP_ID } from "@meru/shared/constants";
import { app } from "electron";
import { accounts } from "@/accounts";
import { blocker } from "@/blocker";
import { config } from "@/config";
import { downloads } from "@/downloads";
import { ipc } from "@/ipc";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appMenu } from "@/menu";
import { appState } from "@/state";
import { theme } from "@/theme";
import { appTray } from "@/tray";
import { appUpdater } from "@/updater";
import { doNotDisturb } from "./do-not-disturb";
import { handleMailto, mailtoUrlArg } from "./mailto";
import { handleMeruUrl, meruUrlArg } from "./meru-url";
import { trial } from "./trial";

(async () => {
	if (platform.isLinux) {
		app.commandLine.appendSwitch("gtk-version", "3");
		app.commandLine.appendSwitch("enable-features", "GlobalShortcutsPortal");
	}

	if (platform.isWindows) {
		app.setAppUserModelId(APP_ID);
	}

	if (!app.requestSingleInstanceLock()) {
		app.quit();

		return;
	}

	if (config.get("hardwareAcceleration") === false) {
		app.disableHardwareAcceleration();
	}

	if (process.defaultApp) {
		// Handles dev mode
		if (process.argv[1]) {
			app.setAsDefaultProtocolClient("meru", process.execPath, [
				path.resolve(process.argv[1]),
			]);
		}
	} else {
		app.setAsDefaultProtocolClient("meru");
	}

	if (config.get("resetConfig")) {
		config.clear();

		app.relaunch();

		app.quit();

		return;
	}

	if (!(await licenseKey.validate())) {
		app.quit();

		return;
	}

	if (!(await trial.validate())) {
		app.quit();

		return;
	}

	downloads.init();

	await Promise.all([app.whenReady(), blocker.init()]);

	theme.init();

	accounts.init();

	main.init();

	main.loadURL();

	accounts.createViews();

	ipc.init();

	appMenu.init();

	appTray.init();

	appUpdater.init();

	doNotDisturb.init();

	if (mailtoUrlArg) {
		handleMailto(mailtoUrlArg);
	}

	if (meruUrlArg) {
		handleMeruUrl(meruUrlArg);
	}

	app.on("second-instance", (_event, argv) => {
		main.show();

		if (!platform.isMacOS) {
			const mailtoUrlArg = argv.find((arg) => arg.startsWith("mailto:"));

			if (mailtoUrlArg) {
				handleMailto(mailtoUrlArg);
			}

			const meruUrlArg = argv.find((arg) => arg.startsWith("meru://"));

			if (meruUrlArg) {
				handleMeruUrl(meruUrlArg);
			}
		}
	});

	app.on("activate", () => {
		main.show();
	});

	if (platform.isMacOS) {
		app.on("open-url", async (_event, url) => {
			if (url.startsWith("meru://")) {
				handleMeruUrl(url);
			} else {
				handleMailto(url);
			}
		});
	}

	if (!app.commandLine.hasSwitch("disable-bring-to-top-on-focus")) {
		main.window.on("focus", () => {
			if (!appState.isSettingsOpen) {
				accounts.getSelectedAccount().instance.gmail.view.webContents.focus();
			}
		});
	}

	app.on("before-quit", () => {
		if (!appState.isQuittingApp) {
			main.saveWindowState();

			appState.isQuittingApp = true;
		}
	});
})();
