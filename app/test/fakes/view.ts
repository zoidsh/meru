import type { Unsubscribe, ViewPort, ViewSpec } from "../../core/ports.ts";
import type { Rect } from "../../core/records/rect.ts";

let nextContentsId = 1000;

export class FakeView implements ViewPort {
  readonly contentsId: number;
  readonly spec: ViewSpec;
  url: string | undefined;
  radius: number;
  zoom: number;
  backgroundColor: string | undefined;
  destroyed = false;
  focused = false;
  #bounds: Rect = { height: 0, width: 0, x: 0, y: 0 };
  readonly #focusListeners = new Set<() => void>();
  readonly #goneListeners = new Set<(reason: string) => void>();

  constructor(spec: ViewSpec) {
    nextContentsId += 1;
    this.contentsId = nextContentsId;
    this.spec = spec;
    this.radius = spec.radius;
    this.zoom = spec.zoom;
  }

  readonly setBounds = (rect: Rect) => {
    this.#bounds = rect;
  };

  readonly bounds = () => this.#bounds;

  readonly loadURL = async (url: string) => {
    this.url = url;
    await Promise.resolve();
  };

  readonly focus = () => {
    this.focused = true;
    for (const listener of this.#focusListeners) {
      listener();
    }
  };

  readonly isFocused = () => this.focused;

  readonly onFocus = (listener: () => void): Unsubscribe => {
    this.#focusListeners.add(listener);
    return () => {
      this.#focusListeners.delete(listener);
    };
  };

  readonly setBackgroundColor = (color: string) => {
    this.backgroundColor = color;
  };

  readonly setBorderRadius = (radius: number) => {
    this.radius = radius;
  };

  readonly setZoomFactor = (factor: number) => {
    this.zoom = factor;
  };

  readonly zoomFactor = () => this.zoom;

  readonly destroy = () => {
    this.destroyed = true;
  };

  readonly onRenderProcessGone = (
    listener: (reason: string) => void
  ): Unsubscribe => {
    this.#goneListeners.add(listener);
    return () => {
      this.#goneListeners.delete(listener);
    };
  };

  readonly crash = (reason: string) => {
    for (const listener of this.#goneListeners) {
      listener(reason);
    }
  };
}
