import path from "node:path";
import { is } from "@electron-toolkit/utils";
import { BrowserWindow, nativeTheme, screen, WebContentsView } from "electron";

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
