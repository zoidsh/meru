import type { Unsubscribe, ViewPort, WindowPort } from "../../core/ports.ts";
import type { Rect } from "../../core/records/rect.ts";

export type ChildViewEffect =
  | { readonly kind: "add"; readonly view: ViewPort; readonly index: number }
  | { readonly kind: "remove"; readonly view: ViewPort };

let nextContentsId = 1;

export class FakeWindow implements WindowPort {
  readonly contentsId: number;
  readonly effects: ChildViewEffect[] = [];
  loaded: string | undefined;
  shown: "active" | "inactive" | undefined;
  #size: { width: number; height: number };
  #children: ViewPort[] = [];
  readonly #resized = new Set<() => void>();
  readonly #closed = new Set<() => void>();

  constructor(width = 1200, height = 800) {
    nextContentsId += 1;
    this.contentsId = nextContentsId;
    this.#size = { height, width };
  }

  readonly loadUrl = async (url: string) => {
    this.loaded = url;
    await Promise.resolve();
  };

  readonly loadFile = async (path: string) => {
    this.loaded = path;
    await Promise.resolve();
  };

  readonly show = () => {
    this.shown = "active";
  };

  readonly showInactive = () => {
    this.shown = "inactive";
  };

  readonly contentBounds = (): Rect => ({ ...this.#size, x: 0, y: 0 });

  // Electron's View.addChildView: an attached view moves to the top and the index is ignored.
  readonly addChildView = (view: ViewPort, index: number) => {
    this.effects.push({ index, kind: "add", view });
    if (this.#children.includes(view)) {
      this.#children = [
        ...this.#children.filter((child) => child !== view),
        view,
      ];
      return;
    }
    const at = Math.min(Math.max(index, 0), this.#children.length);
    this.#children = this.#children.toSpliced(at, 0, view);
  };

  readonly removeChildView = (view: ViewPort) => {
    this.effects.push({ kind: "remove", view });
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
