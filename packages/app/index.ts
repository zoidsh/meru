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
import { app, dialog } from "electron";

async function handleMailto(url: string) {
	if (!url.startsWith("mailto:") || url === "mailto:") {
		return;
	}

	const accountConfigs = accounts.getAccountConfigs();

	let accountId = accountConfigs[0]?.id;

	if (accountConfigs.length > 1) {
		const cancelId = accountConfigs.length + 1;

		const { response } = await dialog.showMessageBox(main.window, {
			type: "question",
			message: "Compose new email",
			detail: "Which account would you like to use?",
			buttons: [...accountConfigs.map((account) => account.label), "Cancel"],
			cancelId,
		});

		if (response === cancelId) {
			return;
		}

		const accountConfig = accountConfigs[response];

		if (!accountConfig) {
			throw new Error("Could not find account config");
		}

		accountId = accountConfig.id;
	}

	if (!accountId) {
		throw new Error("Could not determine account id");
	}

	accounts.getAccount(accountId).gmail.mailto(url);
}

const mailtoUrl = !platform.isMacOS
	? process.argv.find((arg) => arg.startsWith("mailto:"))
	: undefined;

(async () => {
	app.setAppUserModelId("sh.zoid.meru");

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

	if (!(await validateLicenseKey())) {
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

	if (mailtoUrl) {
		handleMailto(mailtoUrl);
	}

	app.on("second-instance", (_event, argv) => {
		main.show();

		if (!platform.isMacOS && appState.isValidLicenseKey) {
			const mailtoUrl = argv.find((arg) => arg.startsWith("mailto:"));

			if (mailtoUrl) {
				handleMailto(mailtoUrl);
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
