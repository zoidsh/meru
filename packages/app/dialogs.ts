import { app, dialog } from "electron";

export async function showRestartDialog() {
	const { response } = await dialog.showMessageBox({
		type: "info",
		buttons: ["Restart", "Later"],
		message: "Restart required to apply changes",
		detail: "Do you want to restart the app now?",
		defaultId: 0,
		cancelId: 1,
	});

	if (response === 0) {
		app.relaunch();
		app.quit();
	}
}
