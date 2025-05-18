import { ipcRenderer } from "@/ipc";
import { main } from "@/main";

class AppState {
	isQuittingApp = false;

	isSettingsOpen = false;

	isValidLicenseKey = false;

	trialDaysLeft = 0;

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

	setTrialDaysLeft(daysLeft: number) {
		this.trialDaysLeft = daysLeft;

		ipcRenderer.send(
			main.window.webContents,
			"trial.daysLeftChanged",
			this.trialDaysLeft,
		);
	}
}

export const appState = new AppState();
