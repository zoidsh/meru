import type { ViewPort, ViewSpec } from "../../../core/ports.ts";
import { loadOwned, TRANSPARENT } from "./owned-view.ts";
import type { OwnedView } from "./owned-view.ts";

export interface OverlayOptions {
  readonly create: (spec: ViewSpec) => OwnedView;
  /** The preload of an overlay's page, which is one of the renderer's. */
  readonly preload: string | undefined;
  readonly onError: (error: unknown) => void;
}

// The chrome page cannot draw over the panes, which are views above it, so an overlay is a transparent view of its own over the whole window, taking the keyboard while it is up.
/** A renderer page, such as the launcher, drawn over a stage's panes; one at a time. */
export class Overlay {
  readonly #options: OverlayOptions;
  #owned: OwnedView | undefined;

  constructor(options: OverlayOptions) {
    this.#options = options;
  }

  /** The overlay's view while one is up. */
  get view(): ViewPort | undefined {
    return this.#owned?.view;
  }

  /** Makes the view of an overlay showing `url`, focused once its page has loaded; the caller attaches it. */
  open(url: string, args: readonly string[]): ViewPort {
    const owned = this.#options.create({
      arguments: args,
      background: TRANSPARENT,
      preload: this.#options.preload,
      radius: 0,
      zoom: 1,
    });
    this.#owned = owned;
    const { view } = owned;
    // Focused once loaded, since a view focused before its page exists hands the page no focus to start with.
    const focusLoaded = async () => {
      if (
        (await loadOwned(view, url, this.#options.onError)) &&
        this.#owned === owned
      ) {
        view.focus();
      }
    };
    void focusLoaded();
    return view;
  }

  /** Forgets the overlay and hands back its view for the caller to detach and dispose; undefined with none up. */
  close(): OwnedView | undefined {
    const owned = this.#owned;
    this.#owned = undefined;
    return owned;
  }
}
