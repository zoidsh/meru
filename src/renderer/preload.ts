import type { ElectronAPI } from "@electron-toolkit/preload";
import { exposeElectronAPI } from "@electron-toolkit/preload";

declare global {
	interface Window {
		electron: ElectronAPI;
	}
}

exposeElectronAPI();
