import type {
  OpenListener,
  Unsubscribe,
  ViewPort,
  ViewSpec,
} from "../../core/ports.ts";
import type { Disposition } from "../../core/records/link.ts";
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

  readonly #openListeners = new Set<OpenListener>();

  readonly onOpen = (listener: OpenListener): Unsubscribe => {
    this.#openListeners.add(listener);
    return () => {
      this.#openListeners.delete(listener);
    };
  };

  /** Opens a link as the page would, in place unless `disposition` names a new window or tab: true when a listener took it from the page. */
  readonly open = (
    url: string,
    disposition: Disposition = "inPlace"
  ): boolean =>
    [...this.#openListeners].some((listener) => listener(url, disposition));

  readonly #popupListeners = new Set<(url: string) => boolean>();

  readonly onPopup = (listener: (url: string) => boolean): Unsubscribe => {
    this.#popupListeners.add(listener);
    return () => {
      this.#popupListeners.delete(listener);
    };
  };

  /** Opens a blank popup and points it at `url`, as Google's sign-in does: true when the popup would show. */
  readonly popup = (url: string): boolean =>
    this.#popupListeners.size === 0 ||
    [...this.#popupListeners].some((listener) => listener(url));

  readonly #fullscreenListeners = new Set<(entered: boolean) => void>();

  readonly onFullscreen = (
    listener: (entered: boolean) => void
  ): Unsubscribe => {
    this.#fullscreenListeners.add(listener);
    return () => {
      this.#fullscreenListeners.delete(listener);
    };
  };

  /** Asks for fullscreen, or leaves it, as a video's fullscreen button would. */
  readonly fullscreen = (entered: boolean) => {
    for (const listener of this.#fullscreenListeners) {
      listener(entered);
    }
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
