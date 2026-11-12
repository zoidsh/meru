import type { Ports, WindowPort } from "../../core/ports.ts";

export interface MainWindowOptions {
  readonly ports: Ports;
  readonly preload: string;
  /** The renderer dev server's chrome page; the built file is loaded when it is unset. */
  readonly rendererUrl: string | undefined;
  readonly rendererFile: string;
  /** Open behind whatever is in front, for a desktop other sessions share. */
  readonly background: boolean;
}

export class MainWindow {
  readonly #options: MainWindowOptions;
  #window: WindowPort | undefined;

  constructor(options: MainWindowOptions) {
    this.#options = options;
  }

  async show(): Promise<void> {
    const { ports, preload, rendererUrl, rendererFile, background } =
      this.#options;
    const window = ports.createWindow({
      height: 800,
      preload,
      title: "Meru",
      width: 1200,
    });
    this.#window = window;
    window.onClosed(() => {
      this.#window = undefined;
    });

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
