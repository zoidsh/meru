import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromeColors, titleBarOf } from "../../core/engines/chrome.ts";
import type { Theme } from "../../core/engines/chrome.ts";
import type { Ports, WindowPort } from "../../core/ports.ts";
import type { Rect } from "../../core/records/rect.ts";
import type { IpcRegistrar } from "../../shared/channels/define.ts";
import { themePushes } from "../../shared/channels/theme.ts";

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
  /** Tells every page the theme changed. */
  readonly registrar: Pick<IpcRegistrar, "broadcast">;
  readonly preload: string;
  /** Passed to the chrome page's renderer process. */
  readonly arguments: readonly string[];
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

  constructor(options: MainWindowOptions) {
    this.#options = options;
  }

  async show(): Promise<WindowPort> {
    const {
      arguments: args,
      ports,
      preload,
      bounds,
      pages,
      background,
      linuxControls,
      onCreated,
      registrar,
    } = this.#options;
    const { platform } = ports.lifecycle;
    const theme = (): Theme => (ports.theme.dark() ? "dark" : "light");
    const window = ports.windows.create({
      arguments: args,
      background: chromeColors(theme()).background,
      bounds,
      preload,
      title: "Meru",
      titleBar: titleBarOf({ linuxControls, platform, theme: theme() }),
    });
    const stopFollowing = ports.theme.onChange(() => {
      window.setBackgroundColor(chromeColors(theme()).background);
      const { overlay } = titleBarOf({
        linuxControls,
        platform,
        theme: theme(),
      });
      // macOS draws its traffic lights in its own colours, and Electron recolours an overlay only on Windows and Linux.
      if (overlay !== null && platform !== "darwin") {
        window.setTitleBarOverlay(overlay);
      }
      registrar.broadcast(themePushes.changed, { theme: theme() });
    });
    window.onClosed(stopFollowing);
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
}
