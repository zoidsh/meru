import { ipc } from "@/ipc";
import { main } from "@/main";

class AppState {
	isQuittingApp = false;

	isSettingsOpen = false;

	isLicenseKeyValid = false;

	setIsSettingsOpen(value: boolean) {
		this.isSettingsOpen = value;

		ipc.renderer.send(
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
