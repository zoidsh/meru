import path from "node:path";
import { is, platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  nativeTheme,
  screen,
  WebContentsView,
} from "electron";
import { isLinuxWindowControlsEnabled } from "./linux";

const CASCADE_OFFSET = 30;

export function getCascadedWindowBounds({ width, height }: { width: number; height: number }) {
  const allWindows = BrowserWindow.getAllWindows();

  if (!allWindows.length) {
    return { width, height };
  }

  const reference = allWindows.reduce((mostRecent, current) =>
    current.id > mostRecent.id ? current : mostRecent,
  );

  const referenceBounds = reference.getBounds();
  const display = screen.getDisplayMatching(referenceBounds);
  const workArea = display.workArea;

  let x = referenceBounds.x + CASCADE_OFFSET;
  let y = referenceBounds.y + CASCADE_OFFSET;

  if (x + width > workArea.x + workArea.width || y + height > workArea.y + workArea.height) {
    x = workArea.x + CASCADE_OFFSET;
    y = workArea.y + CASCADE_OFFSET;
  }

  return { x, y, width, height };
}

export function getPreloadPath(name: string) {
  return path.join(__dirname, `preload-${name}.js`);
}

export function getTitleBarOptions() {
  const titleBarOverlay =
    !platform.isLinux || isLinuxWindowControlsEnabled()
      ? {
          color: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
          symbolColor: nativeTheme.shouldUseDarkColors ? "#fafafa" : "#0a0a0a",
          height: APP_TITLEBAR_HEIGHT - 1,
        }
      : false;

  return {
    titleBarStyle: platform.isMacOS ? ("hiddenInset" as const) : ("hidden" as const),
    titleBarOverlay,
  };
}

export function getCommonBrowserWindowOptions() {
  return {
    ...getTitleBarOptions(),
    darkTheme: nativeTheme.shouldUseDarkColors,
    webPreferences: {
      preload: getPreloadPath("renderer"),
    },
  };
}

export function createBrowserWindow(options: BrowserWindowConstructorOptions) {
  const browserWindow = new BrowserWindow({
    show: false,
    ...options,
  });

  browserWindow.once("ready-to-show", () => {
    browserWindow.show();
  });

  return browserWindow;
}

type LoadRendererOptions = {
  renderer: string;
  port: number;
  searchParams?: URLSearchParams;
  hash?: string;
};

export function loadRenderer(
  window: BrowserWindow | WebContentsView,
  options: LoadRendererOptions,
) {
  const { renderer, port, hash } = options;

  const searchParams = options.searchParams ?? new URLSearchParams();

  searchParams.set("darkMode", nativeTheme.shouldUseDarkColors ? "true" : "false");

  const rendererName = `renderer-${renderer}`;

  if (is.dev) {
    const hashSuffix = hash ? `#${hash}` : "";

    window.webContents.loadURL(`http://localhost:${port}/?${searchParams.toString()}${hashSuffix}`);

    window.webContents.openDevTools({ mode: "detach" });
  } else {
    window.webContents.loadFile(path.join("build-js", rendererName, "index.html"), {
      search: searchParams.toString(),
      ...(hash ? { hash } : {}),
    });
  }
}

export function applyViewZoomLimits(view: WebContentsView) {
  view.webContents.on("dom-ready", () => {
    view.webContents.setVisualZoomLevelLimits(1, 3);
  });
}
