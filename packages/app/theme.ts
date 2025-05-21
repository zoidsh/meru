import { config } from "@/config";
import { ipcRenderer } from "@/ipc";
import { main } from "@/main";
import { appTray } from "@/tray";
import { nativeTheme } from "electron";

class Theme {
	init() {
		nativeTheme.themeSource = config.get("theme");

		nativeTheme.on("updated", () => {
			ipcRenderer.send(
				main.window.webContents,
				"darkModeChanged",
				nativeTheme.shouldUseDarkColors,
			);

			main.updateTitlebarOverlay();

			appTray.updateIcon();
		});
	}
}

export const theme = new Theme();
