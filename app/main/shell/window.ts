import type { Ports, WindowPort } from "../../core/ports.ts";
import type { Rect } from "../../core/records/rect.ts";

export interface MainWindowOptions {
  readonly ports: Ports;
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
  /** Runs before the chrome page loads, so whatever the page asks for on its first paint is there. */
  readonly onCreated: (window: WindowPort) => void;
}

export class MainWindow {
  readonly #options: MainWindowOptions;
  #window: WindowPort | undefined;

  constructor(options: MainWindowOptions) {
    this.#options = options;
  }

  async show(): Promise<void> {
    const {
      arguments: args,
      ports,
      preload,
      bounds,
      rendererUrl,
      rendererFile,
      background,
      onCreated,
    } = this.#options;
    const window = ports.windows.create({
      arguments: args,
      bounds,
      preload,
      title: "Meru",
    });
    this.#window = window;
    window.onClosed(() => {
      this.#window = undefined;
    });
    onCreated(window);

    await (rendererUrl === undefined
      ? window.loadFile(rendererFile)
      : window.loadUrl(rendererUrl));

    // A first show() activates the app on macOS and takes the foreground; showInactive() does not.
    if (background) {
      window.showInactive();
    } else {
      window.show();
    }
  }

  get isOpen(): boolean {
    return this.#window !== undefined;
  }
}
