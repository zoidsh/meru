import { nativeTheme } from "electron";
import { config } from "@/config";
import { ipc } from "@/ipc";
import { main } from "@/main";
import { appTray } from "@/tray";

class Theme {
	init() {
		nativeTheme.themeSource = config.get("theme");

		nativeTheme.on("updated", () => {
			ipc.renderer.send(
				main.window.webContents,
				"theme.darkModeChanged",
				nativeTheme.shouldUseDarkColors,
			);

			main.updateTitlebarOverlay();

			appTray.updateIcon();
		});
	}
}

export const theme = new Theme();
