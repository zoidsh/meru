import { contextBridge } from "electron";
import { exposeElectronTRPC } from "electron-trpc/main";

process.once("loaded", async () => {
	exposeElectronTRPC();
});

declare global {
	interface Window {
		platform: typeof process.platform;
	}
}

contextBridge.exposeInMainWorld("platform", process.platform);
