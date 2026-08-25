import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { DEFAULT_WINDOW_STATE_BOUNDS } from "@meru/shared/config";
import { app, BrowserWindow, screen } from "electron";
import { accounts } from "@/accounts";
import { config } from "@/config";
import {
  getCommonBrowserWindowOptions,
  getTitleBarOptions,
  isWindowVisibleOnConnectedDisplay,
  loadRenderer,
} from "@/lib/window";
import { appMenu } from "@/menu";
import { openExternalUrl } from "@/url";
import { ipc } from "./ipc";
import { trial } from "./trial";

class Main {
  private _window: BrowserWindow | undefined;

  location = "/";

  private setLocation(location: string) {
    const wasAccountLocation = this.location === "/";

    this.location = location;

    const isAccountLocation = location === "/";

    if (isAccountLocation === wasAccountLocation) {
      return;
    }

    if (isAccountLocation) {
      accounts.show();
    } else {
      accounts.hide();
    }

    appMenu.refresh();
  }

  get window() {
    if (!this._window) {
      throw new Error("Window has not been initialized");
    }

    return this._window;
  }

  set window(browserWindow: BrowserWindow) {
    this._window = browserWindow;
  }

  shouldLaunchMinimized =
    app.commandLine.hasSwitch("launch-minimized") || config.get("launchMinimized");

  isQuittingApp = false;

  loadURL() {
    const searchParams = new URLSearchParams();

    searchParams.set(
      "accounts",
      JSON.stringify(
        accounts.getAccounts().map((account) => ({
          config: account.config,
          gmail: account.instance.gmail.store.getState(),
          verticalTabsWidth: account.instance.verticalTabsWidth,
        })),
      ),
    );

    searchParams.set("accountsUnreadBadge", JSON.stringify(config.get("accounts.unreadBadge")));

    if (trial.daysLeft) {
      searchParams.set("trialDaysLeft", JSON.stringify(trial.daysLeft));
    }

    loadRenderer(this.window, {
      page: "main",
      searchParams,
    });
  }

  updateTitlebarOverlay() {
    if (platform.isMacOS) {
      return;
    }

    const { titleBarOverlay } = getTitleBarOptions();

    if (typeof titleBarOverlay === "boolean") {
      return;
    }

    this.window.setTitleBarOverlay(titleBarOverlay);
  }

  init() {
    const lastWindowState = config.get("window.lastState");
    const restrictWindowMinimumSize = config.get("window.restrictMinimumSize");

    if (!isWindowVisibleOnConnectedDisplay(lastWindowState.bounds)) {
      lastWindowState.bounds = DEFAULT_WINDOW_STATE_BOUNDS;
    }

    this.window = new BrowserWindow({
      title: app.name,
      minWidth: restrictWindowMinimumSize ? 912 : 320,
      width: lastWindowState.bounds.width,
      minHeight: restrictWindowMinimumSize ? 512 : 256,
      height: lastWindowState.bounds.height,
      x: lastWindowState.bounds.x,
      y: lastWindowState.bounds.y,
      show: false,
      ...getCommonBrowserWindowOptions(),
      icon: platform.isLinux ? path.join(__dirname, "..", "static", "Icon.png") : undefined,
    });

    if (!this.shouldLaunchMinimized) {
      this.window.once("ready-to-show", () => {
        this.show();
      });

      if (lastWindowState.fullscreen) {
        this.window.setFullScreen(true);
      }

      if (lastWindowState.maximized) {
        this.window.maximize();
      }
    }

    this.window.webContents.on("did-navigate-in-page", (_event, url) => {
      this.setLocation(`/${new URL(url).hash.replace(/^#?\/?/, "")}`);
    });

    this.window.webContents.setWindowOpenHandler(({ url }) => {
      openExternalUrl(url, { skipTrustedHostCheck: true });

      return {
        action: "deny",
      };
    });

    this.window.on("close", (event) => {
      // Workaround: Closing the main window when on full screen leaves a black screen
      // https://github.com/electron/electron/issues/20263
      if (platform.isMacOS && this.window.isFullScreen()) {
        this.window.once("leave-full-screen", () => {
          this.window.hide();
        });

        this.window.setFullScreen(false);
      }

      if (!this.isQuittingApp) {
        event.preventDefault();

        this.window.blur();

        this.window.hide();

        if (!config.get("dock.enabled")) {
          app.dock?.hide();
        }
      }
    });

    if (platform.isWindows) {
      this.window.on("resized", () => {
        this.saveWindowState();
      });

      this.window.on("moved", () => {
        this.saveWindowState();
      });

      this.window.on("maximize", () => {
        this.saveWindowState();
      });

      this.window.on("unmaximize", () => {
        this.saveWindowState();
      });
    }
  }

  show() {
    if (this.window.isMinimized()) {
      this.window.restore();
    } else {
      this.window.show();
    }

    if (app.dock?.isVisible) {
      app.dock.show();
    }
  }

  saveWindowState() {
    config.set("window.lastState", {
      bounds: main.window.getBounds(),
      fullscreen: main.window.isFullScreen(),
      maximized: main.window.isMaximized(),
    });
  }

  navigate(to: string) {
    this.setLocation(to);

    ipc.renderer.send(main.window.webContents, "navigate", to);

    this.show();
  }

  getWindowBounds() {
    if (!platform.isWindows) {
      return this.window.getBounds();
    }

    /*
     * Taken from the display when maximized, because the window cannot be asked
     * yet. Measured on Windows: `maximize` fires at +33ms with the content area
     * reading 1024x718, and it settles at 1024x720 ten milliseconds later — with
     * no `resize` behind that last change, since Electron gates the event on the
     * window bounds and those had stopped moving before the content area did.
     * Anything laid out on the event is two pixels short and never corrected.
     *
     * A maximized window's content area is the work area of the display it is
     * on, which is the same number without the wait. Full screen is excluded
     * because there the content area is the whole display rather than the part
     * left over by the taskbar.
     */
    if (this.window.isMaximized() && !this.window.isFullScreen()) {
      return screen.getDisplayMatching(this.window.getBounds()).workArea;
    }

    return this.window.getContentBounds();
  }
}

export const main = new Main();
