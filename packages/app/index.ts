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
import { handleMailto, mailtoUrlArg } from "./mailto";
import { trial } from "./trial";

(async () => {
	if (platform.isLinux) {
		app.commandLine.appendSwitch("gtk-version", "3");
	}

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

	downloads.init();

	if ((await licenseKey.validate()) === "failed") {
		app.quit();

		return;
	}

	if ((await trial.validate()) === false) {
		app.quit();

		return;
	}

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

	if (mailtoUrlArg) {
		handleMailto(mailtoUrlArg);
	}

	app.on("second-instance", (_event, argv) => {
		main.show();

		if (!platform.isMacOS && licenseKey.isValid) {
			const mailtoUrlArg = argv.find((arg) => arg.startsWith("mailto:"));

			if (mailtoUrlArg) {
				handleMailto(mailtoUrlArg);
			}
		}
	});

	app.on("activate", () => {
		main.show();
	});

	if (platform.isMacOS && licenseKey.isValid) {
		app.on("open-url", async (_event, url) => {
			handleMailto(url);
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
		main.saveWindowState();

		appState.isQuittingApp = true;
	});
})();
