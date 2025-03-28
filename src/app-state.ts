import { accounts } from "./accounts";
import { ipcRenderer } from "./ipc";
import { main } from "./main";

class AppState {
	isQuittingApp = false;

	isSettingsOpen = false;

	setIsSettingsOpen(value: boolean) {
		this.isSettingsOpen = value;

		if (this.isSettingsOpen) {
			accounts.hide();
		} else {
			accounts.show();
		}

		ipcRenderer.send(
			main.window.webContents,
			"onIsSettingsOpenChanged",
			this.isSettingsOpen,
		);
	}

	toggleIsSettingsOpen() {
		this.isSettingsOpen = !this.isSettingsOpen;

		this.setIsSettingsOpen(this.isSettingsOpen);
	}
}

export const appState = new AppState();
