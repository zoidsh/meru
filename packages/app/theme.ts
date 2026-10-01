import { nativeTheme } from "electron";
import { config } from "@/config";
import { ipc } from "@/ipc";
import { getSystemColors } from "@/lib/system-colors";
import { main } from "@/main";
import { appTray } from "@/tray";

class Theme {
  // Split from `listen()` because the window's colors and the renderer's
  // initial dark mode are read from `nativeTheme.shouldUseDarkColors`, so the
  // source has to be set before the window is created, while the `updated`
  // handler reaches into `main.window` and can only attach once it exists
  init() {
    nativeTheme.themeSource = config.get("theme");
  }

  listen() {
    nativeTheme.on("updated", () => {
      ipc.renderer.send(
        main.window.webContents,
        "theme.darkModeChanged",
        nativeTheme.shouldUseDarkColors,
      );

      ipc.renderer.send(main.window.webContents, "theme.systemColorsChanged", getSystemColors());

      main.updateTitlebarOverlay();

      appTray.updateIcon();
    });
  }
}

export const theme = new Theme();
