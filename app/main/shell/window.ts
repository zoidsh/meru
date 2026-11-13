import { chromeColors, titleBarOf } from "../../core/engines/chrome.ts";
import type { Theme } from "../../core/engines/chrome.ts";
import type { Ports, WindowPort } from "../../core/ports.ts";
import type { Rect } from "../../core/records/rect.ts";

export interface MainWindowOptions {
  readonly ports: Pick<Ports, "lifecycle" | "theme" | "windows">;
  readonly preload: string;
  /** Passed to the chrome page's renderer process. */
  readonly arguments: readonly string[];
  /** Where the window opens on the screen, frame included. */
  readonly bounds: Rect;
  /** The renderer dev server's chrome page; the built file is loaded when it is unset. */
  readonly rendererUrl: string | undefined;
  readonly rendererFile: string;
  /** Open behind whatever is in front, for a desktop other sessions share. */
  readonly background: boolean;
  /** Whether a Linux window draws its own controls, read once, when the window is created. */
  readonly linuxControls: boolean;
  /** Runs before the chrome page loads, so whatever the page asks for on its first paint is there. */
  readonly onCreated: (window: WindowPort) => void;
}

/** What the chrome page reads from its URL, so its first paint is right before anything else arrives. */
export const pageQuery = (platform: string, theme: Theme) => ({
  platform,
  theme,
});

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
      rendererUrl,
      rendererFile,
      background,
      linuxControls,
      onCreated,
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
      if (overlay !== null) {
        window.setTitleBarOverlay(overlay);
      }
    });
    window.onClosed(stopFollowing);
    onCreated(window);

    const query = pageQuery(platform, theme());
    if (rendererUrl === undefined) {
      await window.loadFile(rendererFile, query);
    } else {
      const url = new URL(rendererUrl);
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
      await window.loadUrl(url.href);
    }

    // A first show() activates the app on macOS and takes the foreground; showInactive() does not.
    if (background) {
      window.showInactive();
    } else {
      window.show();
    }
    return window;
  }
}
