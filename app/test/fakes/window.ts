import { clamp } from "es-toolkit";

import type { TitleBarOverlay } from "../../core/engines/chrome.ts";
import type { Unsubscribe, ViewPort, WindowPort } from "../../core/ports.ts";
import type { Rect } from "../../core/records/rect.ts";

let nextContentsId = 1;

export class FakeWindow implements WindowPort {
  readonly contentsId: number;
  loaded: string | undefined;
  query: Readonly<Record<string, string>> | undefined;
  background: string | undefined;
  overlay: TitleBarOverlay | undefined;
  shown: "active" | "inactive" | undefined;
  #size: { width: number; height: number };
  #children: ViewPort[] = [];
  readonly #resized = new Set<() => void>();
  readonly #closed = new Set<() => void>();
  readonly #moved = new Set<() => void>();
  #bounds: Rect;

  constructor(width = 1200, height = 800, x = 0, y = 0) {
    nextContentsId += 1;
    this.contentsId = nextContentsId;
    this.#size = { height, width };
    this.#bounds = { height, width, x, y };
  }

  readonly loadUrl = async (url: string) => {
    this.loaded = url;
    await Promise.resolve();
  };

  readonly loadFile = async (
    path: string,
    query: Readonly<Record<string, string>>
  ) => {
    this.loaded = path;
    this.query = query;
    await Promise.resolve();
  };

  readonly setBackgroundColor = (color: string) => {
    this.background = color;
  };

  readonly setTitleBarOverlay = (overlay: TitleBarOverlay) => {
    this.overlay = overlay;
  };

  readonly show = () => {
    this.shown = "active";
  };

  readonly showInactive = () => {
    this.shown = "inactive";
  };

  readonly contentBounds = (): Rect => ({ ...this.#size, x: 0, y: 0 });

  readonly bounds = (): Rect => this.#bounds;

  readonly onBoundsChanged = (listener: () => void): Unsubscribe => {
    this.#moved.add(listener);
    return () => {
      this.#moved.delete(listener);
    };
  };

  /** Moves or resizes the window as the user would, by its outer bounds. */
  readonly setBounds = (bounds: Rect) => {
    this.#bounds = bounds;
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
    this.#size = { height, width };
    for (const listener of this.#resized) {
      listener();
    }
  };

  readonly close = () => {
    this.#children = [];
    for (const listener of this.#closed) {
      listener();
    }
  };
}
