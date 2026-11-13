import type { Point, Rect } from "./records/rect.ts";
import type { Result } from "./result.ts";

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
  /** Calls `listener` when the file may have changed on disk; a change can be reported more than once. */
  readonly watch: (name: string, listener: () => void) => Unsubscribe;
}

export interface AppPort {
  readonly platform: string;
  /** False for a run from the repository, such as `pnpm dev` or the end-to-end suite. */
  readonly packaged: boolean;
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
  readonly setZoomFactor: (factor: number) => void;
  readonly zoomFactor: () => number;
  readonly destroy: () => void;
  readonly onRenderProcessGone: (
    listener: (reason: string) => void
  ) => Unsubscribe;
}

export interface ViewSpec {
  readonly partition?: string;
  readonly preload?: string;
  readonly radius: number;
  readonly zoom: number;
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
  /** The window's outer bounds on the screen, frame included. */
  readonly bounds: Rect;
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
  /** The window's outer bounds on the screen, frame included. */
  readonly bounds: () => Rect;
  /** Calls `listener` after the window was moved or resized. */
  readonly onBoundsChanged: (listener: () => void) => Unsubscribe;
  /** Electron moves a view that is already attached to the top, whatever `index` says. */
  readonly addChildView: (view: ViewPort, index: number) => void;
  readonly removeChildView: (view: ViewPort) => void;
  readonly childViews: () => readonly ViewPort[];
  readonly onResized: (listener: () => void) => Unsubscribe;
  readonly onClosed: (listener: () => void) => Unsubscribe;
}

export interface EntitlementRequest {
  /** Null on a device with no license key, which the API answers with a trial. */
  readonly licenseKey: string | null;
  readonly deviceId: string;
}

export type EntitlementApiError =
  /** The request never reached the API or got no answer in time. */
  | { readonly kind: "offline"; readonly detail: string }
  /** The API refused the request, such as an unknown license key; asking again with the same key gets the same answer. */
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "serverError"; readonly detail: string };

export interface EntitlementApi {
  /** Asks for a token for this device; a disabled license is a token, not an error. */
  readonly issue: (
    request: EntitlementRequest
  ) => Promise<Result<{ readonly token: string }, EntitlementApiError>>;
}

/** Whether the machine has a network connection, as the operating system reports it; a server can still be out of reach. */
export interface OnlinePort {
  readonly isOnline: () => boolean;
  /** Calls `listener` when the connection comes or goes. */
  readonly onChange: (listener: (online: boolean) => void) => Unsubscribe;
}

export interface PowerPort {
  /** Calls `listener` when the machine wakes from sleep, during which timers did not run. */
  readonly onResume: (listener: () => void) => Unsubscribe;
}

export type UpdaterEvent =
  | { readonly kind: "checking" }
  | { readonly kind: "available"; readonly version: string }
  | { readonly kind: "notAvailable" }
  /** Percent of the download done, from 0 to 100. */
  | { readonly kind: "progress"; readonly percent: number }
  | { readonly kind: "downloaded"; readonly version: string }
  | { readonly kind: "error"; readonly message: string };

/** The release feed the app was published to; a found update downloads by itself and installs when the app quits. */
export interface UpdaterPort {
  /** Rejects when the feed cannot be read; `prerelease` also offers beta releases. */
  readonly checkForUpdates: (options: {
    readonly prerelease: boolean;
  }) => Promise<void>;
  readonly downloadUpdate: () => Promise<void>;
  /** Quits the app, installs the downloaded update and starts it again. */
  readonly quitAndInstall: () => void;
  readonly onEvent: (listener: (event: UpdaterEvent) => void) => Unsubscribe;
}

export interface Display {
  /** The part of the display a window may cover: the screen less the menu bar, dock or taskbar. */
  readonly workArea: Rect;
  readonly primary: boolean;
}

export interface DisplayPort {
  readonly displays: () => readonly Display[];
}

/** The browser sessions panes load in, one partition per profile. */
export interface SessionPort {
  /** Deletes everything the partition stored: cookies, storage and cache. */
  readonly clear: (partition: string) => Promise<void>;
}

export interface Ports {
  readonly app: AppPort;
  readonly clock: Clock;
  readonly fs: FsPort;
  readonly ids: Ids;
  readonly cursor: CursorPort;
  readonly displays: DisplayPort;
  readonly ipc: IpcTransportPort;
  readonly network: OnlinePort;
  readonly power: PowerPort;
  readonly sessions: SessionPort;
  readonly views: ViewFactoryPort;
  readonly createWindow: (spec: WindowSpec) => WindowPort;
}
