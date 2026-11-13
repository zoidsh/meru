import type { ViewFactoryPort, ViewPort } from "../../../core/ports.ts";

export interface OverlayOptions {
  readonly views: ViewFactoryPort;
  /** The preload of an overlay's page, which is one of the renderer's. */
  readonly preload: string | undefined;
  readonly onError: (error: unknown) => void;
}

const TRANSPARENT = "#00000000";

// A page of the chrome page's cannot draw over the panes, which are views above it, so an overlay is a transparent view of its own over the whole window, taking the keyboard while it is up.
/** A renderer page, such as the launcher, drawn over a stage's panes; one at a time. */
export class Overlay {
  readonly #options: OverlayOptions;
  #view: ViewPort | undefined;

  constructor(options: OverlayOptions) {
    this.#options = options;
  }

  /** The overlay's view while one is up. */
  get view(): ViewPort | undefined {
    return this.#view;
  }

  /** Makes the view of an overlay showing `url`, focused once its page has loaded; the caller attaches it. */
  open(url: string, args: readonly string[]): ViewPort {
    const view = this.#options.views.create({
      arguments: args,
      preload: this.#options.preload,
      radius: 0,
      zoom: 1,
    });
    view.setBackgroundColor(TRANSPARENT);
    this.#view = view;
    // Focused once loaded, since a view focused before its page exists hands the page no focus to start with.
    const load = async () => {
      try {
        await view.loadURL(url);
        if (this.#view === view) {
          view.focus();
        }
      } catch (error) {
        this.#options.onError(error);
      }
    };
    void load();
    return view;
  }

  /** Forgets the overlay and hands back its view for the caller to detach and destroy; undefined with none up. */
  close(): ViewPort | undefined {
    const view = this.#view;
    this.#view = undefined;
    return view;
  }
}
