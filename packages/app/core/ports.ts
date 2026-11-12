import type { Point, Rect } from "./records/rect.ts";

export type Ids = () => string;

export type Unsubscribe = () => void;

export interface Clock {
  readonly now: () => number;
  /** Runs `task` once after `delay` milliseconds unless cancelled first. */
  readonly schedule: (delay: number, task: () => void) => Unsubscribe;
}

/** Files under the user data directory, named relative to it; a name is one path segment. */
export interface FsPort {
  readonly userDataDir: string;
  /** Undefined when the file does not exist. */
  readonly readText: (name: string) => Promise<string | undefined>;
  /** Replaces the file whole or not at all. */
  readonly writeTextAtomic: (name: string, text: string) => Promise<void>;
  readonly exists: (name: string) => Promise<boolean>;
}

export interface AppPort {
  readonly platform: string;
  readonly whenReady: () => Promise<void>;
  readonly onWindowAllClosed: (listener: () => void) => Unsubscribe;
  /** Holds the quit until `task` settles, such as a snapshot written to disk. */
  readonly onQuit: (task: () => Promise<void>) => Unsubscribe;
  readonly quit: () => void;
  /** Keeps the app from ever coming to the front, for a run nobody watches; macOS only. */
  readonly prohibitActivation: () => void;
}

export interface ViewPort {
  readonly contentsId: number;
  readonly setBounds: (rect: Rect) => void;
  readonly bounds: () => Rect;
  readonly loadURL: (url: string) => Promise<void>;
  readonly focus: () => void;
  readonly isFocused: () => boolean;
  readonly onFocus: (listener: () => void) => Unsubscribe;
  readonly setBackgroundColor: (color: string) => void;
  readonly setBorderRadius: (radius: number) => void;
  readonly destroy: () => void;
  readonly onRenderProcessGone: (
    listener: (reason: string) => void
  ) => Unsubscribe;
}

export interface ViewSpec {
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

export interface IpcTransportPort {
  readonly send: (
    contentsId: number,
    channel: string,
    payload: unknown
  ) => void;
}

export interface WindowSpec {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  /** Absolute path of the built preload the window's page runs with. */
  readonly preload: string;
}

export interface WindowPort {
  readonly contentsId: number;
  readonly loadUrl: (url: string) => Promise<void>;
  readonly loadFile: (path: string) => Promise<void>;
  readonly show: () => void;
  /** Shows the window without activating the app, so it opens behind whatever is in front. */
  readonly showInactive: () => void;
  readonly contentBounds: () => Rect;
  /** Electron moves a view that is already attached to the top, whatever `index` says. */
  readonly addChildView: (view: ViewPort, index: number) => void;
  readonly removeChildView: (view: ViewPort) => void;
  readonly childViews: () => readonly ViewPort[];
  readonly onResized: (listener: () => void) => Unsubscribe;
  readonly onClosed: (listener: () => void) => Unsubscribe;
}

export interface Ports {
  readonly app: AppPort;
  readonly clock: Clock;
  readonly fs: FsPort;
  readonly ids: Ids;
  readonly cursor: CursorPort;
  readonly ipc: IpcTransportPort;
  readonly views: ViewFactoryPort;
  readonly createWindow: (spec: WindowSpec) => WindowPort;
}
