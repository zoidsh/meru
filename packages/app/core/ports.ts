import type { Point, Rect } from "./records/rect.ts";

export type Ids = () => string;

export interface Clock {
  readonly now: () => number;
}

export type Unsubscribe = () => void;

export interface AppPort {
  readonly platform: string;
  readonly whenReady: () => Promise<void>;
  readonly onWindowAllClosed: (listener: () => void) => Unsubscribe;
  readonly quit: () => void;
  /** Keeps the app from ever coming to the front, for a run nobody watches; macOS only. */
  readonly prohibitActivation: () => void;
}

export interface ViewPort {
  /** The id of the view's WebContents, which is how IPC names its sender. */
  readonly contentsId: number;
  readonly setBounds: (rect: Rect) => void;
  readonly bounds: () => Rect;
  readonly loadURL: (url: string) => Promise<void>;
  readonly focus: () => void;
  readonly isFocused: () => boolean;
  readonly onFocus: (listener: () => void) => Unsubscribe;
  /** A CSS colour, `#00000000` for transparent. */
  readonly setBackgroundColor: (color: string) => void;
  readonly setBorderRadius: (radius: number) => void;
  readonly destroy: () => void;
  readonly onRenderProcessGone: (
    listener: (reason: string) => void
  ) => Unsubscribe;
}

export interface ViewSpec {
  /** The session partition; the default session when unset. */
  readonly partition?: string;
  readonly preload?: string;
  readonly radius: number;
}

export interface ViewFactoryPort {
  readonly create: (spec: ViewSpec) => ViewPort;
}

export interface CursorPort {
  readonly screenPoint: () => Point;
}

export interface WindowSpec {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  /** Absolute path of the built preload the window's page runs with. */
  readonly preload: string;
}

export interface WindowPort {
  /** The id of the window's own WebContents, the chrome page. */
  readonly contentsId: number;
  readonly loadUrl: (url: string) => Promise<void>;
  readonly loadFile: (path: string) => Promise<void>;
  readonly show: () => void;
  /** Shows the window without activating the app, so it opens behind whatever is in front. */
  readonly showInactive: () => void;
  /** Size of the content area; its origin is the content area's top left, so `x` and `y` are 0. */
  readonly contentBounds: () => Rect;
  /** Electron moves a view that is already attached to the top, whatever `index` says. */
  readonly addChildView: (view: ViewPort, index: number) => void;
  readonly removeChildView: (view: ViewPort) => void;
  /** Bottom first. */
  readonly childViews: () => readonly ViewPort[];
  readonly onResized: (listener: () => void) => Unsubscribe;
  readonly onClosed: (listener: () => void) => Unsubscribe;
}

export interface Ports {
  readonly app: AppPort;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly cursor: CursorPort;
  readonly views: ViewFactoryPort;
  readonly createWindow: (spec: WindowSpec) => WindowPort;
}
