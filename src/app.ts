import { config } from "@/lib/config";
import { main } from "@/main";
import { app } from "electron";
import { accounts } from "./accounts";
import { appMenu } from "./app-menu";
import { initIpc } from "./ipc";
import { tray } from "./tray";

if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.setAppUserModelId("dev.timche.meru");

if (config.get("hardwareAccelerationEnabled") === false) {
	app.disableHardwareAcceleration();
}

app.whenReady().then(async () => {
	main.init();

	accounts.init();

	initIpc();

	appMenu.init();

	tray.init();
});
