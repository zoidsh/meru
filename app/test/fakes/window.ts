import { clamp } from "es-toolkit";

import type { Unsubscribe, ViewPort, WindowPort } from "../../core/ports.ts";
import type { Rect } from "../../core/records/rect.ts";
import type { TitleBarOverlay } from "../../core/records/title-bar.ts";
import { FakeKeys } from "./keys.ts";

let nextContentsId = 1;

export class FakeWindow implements WindowPort {
  readonly contentsId: number;
  loaded: string | undefined;
  background: string | undefined;
  overlay: TitleBarOverlay | undefined;
  shown: "active" | "inactive" | undefined;
  ignoresMenuShortcuts = false;
  #children: ViewPort[] = [];
  readonly #resized = new Set<() => void>();
  readonly #closed = new Set<() => void>();
  readonly #moved = new Set<() => void>();
  readonly #visibility = new Set<() => void>();
  #bounds: Rect;

  constructor(width = 1200, height = 800, x = 0, y = 0) {
    nextContentsId += 1;
    this.contentsId = nextContentsId;
    this.#bounds = { height, width, x, y };
  }

  readonly loadUrl = async (url: string) => {
    this.loaded = url;
    await Promise.resolve();
  };

  readonly #keys = new FakeKeys();

  readonly onKey = this.#keys.onKey;

  /** Types a key into the page; true when a listener kept it from the page. */
  readonly press = this.#keys.press;

  get listening(): boolean {
    return this.#keys.listening;
  }

  readonly setBackgroundColor = (color: string) => {
    this.background = color;
  };

  readonly setTitleBarOverlay = (overlay: TitleBarOverlay) => {
    this.overlay = overlay;
  };

  readonly show = () => {
    this.#setShown("active");
  };

  readonly showInactive = () => {
    this.#setShown("inactive");
  };

  readonly hide = () => {
    this.#setShown(undefined);
  };

  readonly isVisible = () => this.shown !== undefined;

  readonly onVisibilityChanged = (listener: () => void): Unsubscribe => {
    this.#visibility.add(listener);
    return () => {
      this.#visibility.delete(listener);
    };
  };

  #setShown(shown: FakeWindow["shown"]): void {
    const changed = (shown === undefined) !== (this.shown === undefined);
    this.shown = shown;
    if (changed) {
      for (const listener of this.#visibility) {
        listener();
      }
    }
  }

  readonly setIgnoreMenuShortcuts = (ignore: boolean) => {
    this.ignoresMenuShortcuts = ignore;
  };

  readonly contentBounds = (): Rect => ({
    height: this.#bounds.height,
    width: this.#bounds.width,
    x: 0,
    y: 0,
  });

  readonly bounds = (): Rect => this.#bounds;

  readonly onBoundsChanged = (listener: () => void): Unsubscribe => {
    this.#moved.add(listener);
    return () => {
      this.#moved.delete(listener);
    };
  };

  /** Moves or resizes the window as the user would, by its outer bounds. */
  readonly setBounds = (bounds: Rect) => {
    const resized =
      bounds.width !== this.#bounds.width ||
      bounds.height !== this.#bounds.height;
    this.#bounds = bounds;
    // Electron emits `resize` as well as `move` when the size changes.
    if (resized) {
      for (const listener of this.#resized) {
        listener();
      }
    }
    for (const listener of this.#moved) {
      listener();
    }
  };

  // Electron's View.addChildView: an attached view moves to the top and the index is ignored.
  readonly addChildView = (view: ViewPort, index: number) => {
    if (this.#children.includes(view)) {
      this.#children = [
        ...this.#children.filter((child) => child !== view),
        view,
      ];
      return;
    }
    const at = clamp(index, 0, this.#children.length);
    this.#children = this.#children.toSpliced(at, 0, view);
  };

  readonly removeChildView = (view: ViewPort) => {
    this.#children = this.#children.filter((child) => child !== view);
  };

  readonly childViews = (): readonly ViewPort[] => this.#children;

  readonly onResized = (listener: () => void): Unsubscribe => {
    this.#resized.add(listener);
    return () => {
      this.#resized.delete(listener);
    };
  };

  readonly onClosed = (listener: () => void): Unsubscribe => {
    this.#closed.add(listener);
    return () => {
      this.#closed.delete(listener);
    };
  };

  readonly resize = (width: number, height: number) => {
    this.setBounds({ ...this.#bounds, height, width });
  };

  readonly close = () => {
    this.#children = [];
    for (const listener of this.#closed) {
      listener();
    }
  };
}
