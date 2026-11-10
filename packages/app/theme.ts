import { nativeTheme } from "electron";
import { config } from "@/config";
import { ipc } from "@/ipc";
import { updateTitleBarOverlay } from "@/lib/window";
import { main } from "@/main";
import { settingsWindow } from "@/settings-window";
import { appTray } from "@/tray";
import { WorkspaceApp } from "@/workspace-app";

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
      ipc.broadcast("theme.darkModeChanged", nativeTheme.shouldUseDarkColors);

      for (const window of [main.window, settingsWindow.window, ...WorkspaceApp.getAllWindows()]) {
        if (window) {
          updateTitleBarOverlay(window);
        }
      }

      appTray.updateIcon();
    });
  }
}

export const theme = new Theme();
