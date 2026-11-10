import { BrowserWindow, type WebContents, screen } from "electron";
import { accounts } from "@/accounts";
import { watchForAppMenuKey } from "@/app-menu-shortcut";
import { ipc } from "@/ipc";
import { createBrowserWindow, getCommonBrowserWindowOptions, loadRenderer } from "@/lib/window";
import { main } from "@/main";

const WIDTH = 1000;
const HEIGHT = 720;

class SettingsWindow {
  window: BrowserWindow | undefined;

  /**
   * The page last asked for while the window's page is still loading. Its
   * `navigate` listener does not exist until then, so a request sent earlier
   * would be lost.
   */
  private pendingLocation: string | undefined;

  open(page = "general") {
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- a route
    const location = `/settings/${page}`;

    if (this.window) {
      if (this.pendingLocation) {
        this.pendingLocation = location;
      } else {
        ipc.renderer.send(this.window.webContents, "navigate", location);
      }

      if (this.window.isMinimized()) {
        this.window.restore();
      }

      this.window.show();

      this.window.focus();

      return;
    }

    const { workArea } = screen.getDisplayMatching(main.window.getBounds());

    const width = Math.min(WIDTH, workArea.width);
    const height = Math.min(HEIGHT, workArea.height);

    const browserWindow = createBrowserWindow({
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + (workArea.height - height) / 2),
      width,
      height,
      minWidth: 720,
      minHeight: 480,
      maxWidth: 1200,
      maxHeight: 900,
      maximizable: false,
      fullscreenable: false,
      minimizable: false,
      ...getCommonBrowserWindowOptions(),
    });

    this.window = browserWindow;

    this.pendingLocation = location;

    // On `close` rather than `closed`: Electron still lists a closing window
    // after destroying its webContents, and nothing may send to it then.
    browserWindow.once("close", () => {
      if (this.window === browserWindow) {
        this.window = undefined;

        this.pendingLocation = undefined;
      }
    });

    browserWindow.webContents.once("did-finish-load", () => {
      const pendingLocation = this.pendingLocation;

      this.pendingLocation = undefined;

      if (pendingLocation && pendingLocation !== location && this.window === browserWindow) {
        ipc.renderer.send(browserWindow.webContents, "navigate", pendingLocation);
      }
    });

    watchForAppMenuKey(browserWindow.webContents);

    const searchParams = main.createSeedSearchParams();

    searchParams.set("tabs", JSON.stringify(accounts.serializeTabs()));

    loadRenderer(browserWindow, { page: "settings", searchParams, hash: location });
  }

  /** The window the app menu opens over when `webContents` asks for it. */
  getAppMenuWindow(webContents: WebContents) {
    const window = BrowserWindow.fromWebContents(webContents);

    return window && window === this.window ? window : main.window;
  }
}

export const settingsWindow = new SettingsWindow();
