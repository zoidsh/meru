import { ipcRenderer } from "@/ipc";
import { main } from "@/main";

class AppState {
	isQuittingApp = false;

	isSettingsOpen = false;

	isValidLicenseKey = false;

	setIsSettingsOpen(value: boolean) {
		this.isSettingsOpen = value;

		ipcRenderer.send(
			main.window.webContents,
			"isSettingsOpenChanged",
			this.isSettingsOpen,
		);
	}

	toggleIsSettingsOpen() {
		this.isSettingsOpen = !this.isSettingsOpen;

		this.setIsSettingsOpen(this.isSettingsOpen);
	}
}

export const appState = new AppState();
