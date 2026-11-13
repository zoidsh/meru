import type { Unsubscribe, ViewPort, ViewSpec } from "../../core/ports.ts";
import type {
  Navigation,
  NavigationAction,
} from "../../core/records/navigation.ts";
import type { Rect } from "../../core/records/rect.ts";
import { FakeKeys } from "./keys.ts";

let nextContentsId = 1000;

export class FakeView implements ViewPort {
  readonly contentsId: number;
  readonly spec: ViewSpec;
  url: string | undefined;
  radius: number;
  zoom: number;
  destroyed = false;
  focused = false;
  #bounds: Rect = { height: 0, width: 0, x: 0, y: 0 };
  readonly #focusListeners = new Set<() => void>();
  readonly #navigationListeners = new Set<() => void>();
  readonly navigated: NavigationAction[] = [];
  #navigation: Navigation = {
    canGoBack: false,
    canGoForward: false,
    loading: false,
  };

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

  readonly onFocus = (listener: () => void): Unsubscribe => {
    this.#focusListeners.add(listener);
    return () => {
      this.#focusListeners.delete(listener);
    };
  };

  readonly navigation = () => this.#navigation;

  readonly navigate = (action: NavigationAction) => {
    this.navigated.push(action);
  };

  readonly onNavigation = (listener: () => void): Unsubscribe => {
    this.#navigationListeners.add(listener);
    return () => {
      this.#navigationListeners.delete(listener);
    };
  };

  /** Moves the page through its history as a click inside it would. */
  readonly arrive = (navigation: Navigation) => {
    this.#navigation = navigation;
    for (const listener of this.#navigationListeners) {
      listener();
    }
  };

  readonly #keys = new FakeKeys();

  readonly onKey = this.#keys.onKey;

  /** Types a key into the page; true when a listener kept it from the page. */
  readonly press = this.#keys.press;

  get listening(): boolean {
    return this.#keys.listening;
  }

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
}
