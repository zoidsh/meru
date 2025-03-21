import { type ElectronAPI, exposeElectronAPI } from "@electron-toolkit/preload";

declare global {
	interface Window {
		electron: ElectronAPI;
	}
}

exposeElectronAPI();
