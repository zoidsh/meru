import type { LogPort } from "../../../core/log.ts";
import type { ViewPort, ViewSpec } from "../../../core/ports.ts";
import type { Surface } from "../../../shared/channels/define.ts";
import {
  overlays,
  surfaceArgument,
} from "../../../shared/channels/surfaces.ts";
import type { OverlayKind } from "../../../shared/channels/surfaces.ts";
import { loadOwned, TRANSPARENT } from "./owned-view.ts";
import type { OwnedView } from "./owned-view.ts";

interface OverlayOptions {
  readonly create: (spec: ViewSpec) => OwnedView;
  /** The preload of an overlay's page, which is one of the renderer's. */
  readonly preload: string | undefined;
  readonly log: LogPort;
  /** The overlay's page came, on the surface of its kind, or went, with null. */
  readonly onOverlay: (contentsId: number, surface: Surface | null) => void;
  /** Hands back a view the overlay is done with, for the stage to detach before it disposes it. */
  readonly retire: (owned: OwnedView) => void;
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

  /** Makes the view of an overlay of `kind` showing `url`, focused once its page has loaded, closing any overlay already up; the caller attaches it. */
  open(kind: OverlayKind, url: string): void {
    this.close();
    const owned = this.#options.create({
      arguments: [surfaceArgument(kind)],
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
        (await loadOwned(view, url, this.#options.log)) &&
        this.#owned === owned
      ) {
        view.focus();
      }
    };
    void focusLoaded();
    this.#options.onOverlay(view.contentsId, overlays[kind]);
  }

  /** Takes the overlay down, if one is up. */
  close(): void {
    const owned = this.#owned;
    if (owned === undefined) {
      return;
    }
    this.#owned = undefined;
    this.#options.onOverlay(owned.view.contentsId, null);
    this.#options.retire(owned);
  }
}
