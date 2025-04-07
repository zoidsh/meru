import { nativeTheme } from "electron";
import { ipcRenderer } from "./ipc";
import { config } from "./lib/config";
import { main } from "./main";

export function initTheme() {
	nativeTheme.themeSource = config.get("theme");

	nativeTheme.on("updated", () => {
		ipcRenderer.send(
			main.window.webContents,
			"darkModeChanged",
			nativeTheme.shouldUseDarkColors,
		);
	});
}
