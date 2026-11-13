import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromeColors, titleBarOf } from "../../core/engines/chrome.ts";
import { themeOf } from "../../core/ports.ts";
import type { Ports, WindowPort } from "../../core/ports.ts";
import type { Rect } from "../../core/records/rect.ts";
import type { Theme } from "../../core/records/theme.ts";
import type { IpcRegistrar } from "../../shared/channels/define.ts";
import {
  pageSurfaces,
  surfaceArgument,
} from "../../shared/channels/surfaces.ts";
import type { PageSurfaceName } from "../../shared/channels/surfaces.ts";

export interface PageOptions {
  /** The renderer dev server's address; the built pages are loaded while it is unset. */
  readonly devServer: string | undefined;
  /** The directory the built pages are in. */
  readonly dir: string;
  readonly platform: string;
  readonly theme: () => Theme;
}

/** A renderer page's address, carrying `query` and the platform and theme its first paint needs, since nothing else has arrived by then. */
export const pageUrl = (
  pages: PageOptions,
  file: string,
  query: Readonly<Record<string, string>> = {}
): string => {
  const url =
    pages.devServer === undefined
      ? pathToFileURL(path.join(pages.dir, file))
      : new URL(file, pages.devServer);
  const all = { ...query, platform: pages.platform, theme: pages.theme() };
  for (const [key, value] of Object.entries(all)) {
    url.searchParams.set(key, value);
  }
  return url.href;
};

export interface MainWindowOptions {
  readonly ports: Pick<Ports, "lifecycle" | "theme" | "windows">;
  /** Gives the chrome page its surface. */
  readonly registrar: Pick<IpcRegistrar, "assign">;
  readonly preload: string;
  /** The surface the chrome page's channels are allowed from, which its preload is told too. */
  readonly surface: PageSurfaceName;
  /** Where the window opens on the screen, frame included. */
  readonly bounds: Rect;
  readonly pages: PageOptions;
  /** Open behind whatever is in front, for a desktop other sessions share. */
  readonly background: boolean;
  /** Whether a Linux window draws its own controls, read once, when the window is created. */
  readonly linuxControls: boolean;
  /** Runs before the chrome page loads, so whatever the page asks for on its first paint is there. */
  readonly onCreated: (window: WindowPort) => void;
}

export class MainWindow {
  readonly #options: MainWindowOptions;
  #window: WindowPort | undefined;

  constructor(options: MainWindowOptions) {
    this.#options = options;
  }

  async show(): Promise<WindowPort> {
    const {
      surface,
      ports,
      preload,
      bounds,
      pages,
      background,
      linuxControls,
      onCreated,
      registrar,
    } = this.#options;
    const theme = themeOf(ports.theme);
    const window = ports.windows.create({
      arguments: [surfaceArgument(surface)],
      background: chromeColors(theme).background,
      bounds,
      preload,
      title: "Meru",
      titleBar: titleBarOf({
        linuxControls,
        platform: ports.lifecycle.platform,
        theme,
      }),
    });
    this.#window = window;
    window.onClosed(() => {
      this.#window = undefined;
    });
    registrar.assign(window.contentsId, pageSurfaces[surface]);
    onCreated(window);

    await window.loadUrl(pageUrl(pages, "chrome.html"));

    // A first show() activates the app on macOS and takes the foreground; showInactive() does not.
    if (background) {
      window.showInactive();
    } else {
      window.show();
    }
    return window;
  }

  /** Paints the window's ground and its window controls in the theme's colours, while it is open. */
  recolour(theme: Theme): void {
    if (this.#window !== undefined) {
      const { linuxControls, ports } = this.#options;
      recolour(this.#window, theme, ports.lifecycle.platform, linuxControls);
    }
  }
}

/** Paints a window's ground and its window controls in the theme's colours. */
export const recolour = (
  window: WindowPort,
  theme: Theme,
  platform: string,
  linuxControls: boolean
) => {
  window.setBackgroundColor(chromeColors(theme).background);
  const { overlay } = titleBarOf({ linuxControls, platform, theme });
  // macOS draws its traffic lights in its own colours, and Electron recolours an overlay only on Windows and Linux.
  if (overlay !== null && platform !== "darwin") {
    window.setTitleBarOverlay(overlay);
  }
};
