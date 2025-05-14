import { type ElectronAPI, electronAPI } from "@electron-toolkit/preload";

declare global {
	interface Window {
		electron: ElectronAPI;
	}
}

window.electron = electronAPI;
