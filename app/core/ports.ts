import type { KeyInput } from "./engines/shortcuts.ts";
import type { Disposition } from "./records/link.ts";
import type {
  Navigation,
  NavigationAction,
  PageHistory,
} from "./records/navigation.ts";
import type { Platform } from "./records/platform.ts";
import type { Rect } from "./records/rect.ts";
import type { Theme } from "./records/theme.ts";
import type { TitleBar, TitleBarOverlay } from "./records/title-bar.ts";
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
  /** Undefined when the file does not exist. */
  readonly readText: (name: string) => Promise<string | undefined>;
  /** Replaces the file whole or not at all. */
  readonly writeTextAtomic: (name: string, text: string) => Promise<void>;
  /** Calls `listener` when the file may have changed on disk; a change can be reported more than once. */
  readonly watch: (name: string, listener: () => void) => Unsubscribe;
}

/** Something that went wrong outside any feature's own handling. */
export type Failure =
  | {
      /** An exception nothing caught, or a promise rejected with nothing to hear it. */
      readonly kind: "uncaught" | "unhandledRejection";
      readonly error: unknown;
    }
  | {
      readonly kind: "processGone";
      /** `renderer` for a page's process, else the kind of helper process, such as `GPU`. */
      readonly process: string;
      readonly reason: string;
      readonly exitCode: number;
      /** The page a renderer was showing; empty for any other process. */
      readonly url: string;
    }
  | {
      /** An error a page wrote to its console. */
      readonly kind: "consoleError";
      readonly contentsId: number;
      readonly url: string;
      readonly message: string;
      readonly source: string;
      readonly line: number;
    };

export interface LifecyclePort {
  readonly platform: Platform;
  /** False for a run from the repository, such as `pnpm dev` or the end-to-end suite. */
  readonly packaged: boolean;
  readonly whenReady: () => Promise<void>;
  readonly onWindowAllClosed: (listener: () => void) => Unsubscribe;
  /** Holds the quit until `task` settles, such as a snapshot written to disk. */
  readonly onQuit: (task: () => Promise<void>) => Unsubscribe;
  readonly quit: () => void;
  /** Keeps the app from ever coming to the front, for a run nobody watches; macOS only. */
  readonly prohibitActivation: () => void;
  readonly onFailure: (listener: (failure: Failure) => void) => Unsubscribe;
}

/** Hears each key before the page does; a listener answering true keeps the key from the page. */
export type KeyListener = (input: KeyInput) => boolean;

/** Hears a link the page opens, in a new tab or window or in place; a listener answering true takes it, so the page neither opens a window nor navigates. */
export type OpenListener = (url: string, disposition: Disposition) => boolean;

export interface ViewPort {
  readonly contentsId: number;
  readonly onKey: (listener: KeyListener) => Unsubscribe;
  readonly setBounds: (rect: Rect) => void;
  /** Read only by the end-to-end suite's inspector. */
  readonly bounds: () => Rect;
  readonly loadURL: (url: string) => Promise<void>;
  /** The page's back-forward list as it stands. */
  readonly history: () => PageHistory;
  /** Loads a view that has shown nothing yet at `history`'s current entry, with the rest of the list behind and ahead of it. */
  readonly restore: (history: PageHistory) => Promise<void>;
  readonly focus: () => void;
  readonly onFocus: (listener: () => void) => Unsubscribe;
  readonly navigation: () => Navigation;
  readonly navigate: (action: NavigationAction) => void;
  /** Calls `listener` when what `navigation()` answers may have changed. */
  readonly onNavigation: (listener: () => void) => Unsubscribe;
  /** Calls `listener` for each link the page opens; one nobody takes goes on as Chromium would take it. */
  readonly onOpen: (listener: OpenListener) => Unsubscribe;
  /** Calls `listener` with the first address a blank popup the page opened navigates to, as Google's sign-in does with `window.open("about:blank")`; the popup shows when a listener answers true, or when there is none, and closes otherwise. */
  readonly onPopup: (listener: (url: string) => boolean) => Unsubscribe;
  /** Calls `listener` with true when the page asks for fullscreen, such as a video's fullscreen button, and with false when it leaves it. */
  readonly onFullscreen: (listener: (entered: boolean) => void) => Unsubscribe;
  readonly setBorderRadius: (radius: number) => void;
  readonly setZoomFactor: (factor: number) => void;
  /** Read only by the end-to-end suite's inspector. */
  readonly zoomFactor: () => number;
  /** Whether the page is playing sound now. */
  readonly audible: () => boolean;
  /** Calls `listener` when the page starts or stops playing sound. */
  readonly onAudible: (listener: () => void) => Unsubscribe;
  readonly destroy: () => void;
}

export interface ViewSpec {
  readonly partition?: string;
  readonly preload?: string;
  /** Extra command-line arguments the page's renderer process, and so its preload, sees. */
  readonly arguments?: readonly string[];
  readonly radius: number;
  readonly zoom: number;
  /** What the view shows before its page paints, as hex, with alpha for a view the panes show through. */
  readonly background: string;
}

export interface ViewFactoryPort {
  readonly create: (spec: ViewSpec) => ViewPort;
}

export interface IpcTransportPort {
  /** False when the web contents is gone, and nothing was sent. */
  readonly send: (
    contentsId: number,
    channel: string,
    payload: unknown
  ) => boolean;
}

export interface WindowSpec {
  readonly title: string;
  /** The window's outer bounds on the screen, frame included. */
  readonly bounds: Rect;
  /** Absolute path of the built preload the window's page runs with. */
  readonly preload: string;
  /** Extra command-line arguments the page's renderer process, and so its preload, sees. */
  readonly arguments: readonly string[];
  readonly titleBar: TitleBar;
  /** What shows before the page paints, as hex. */
  readonly background: string;
}

export interface WindowFactoryPort {
  readonly create: (spec: WindowSpec) => WindowPort;
}

export interface WindowPort {
  readonly contentsId: number;
  /** Keys typed into the window's own page, the chrome. */
  readonly onKey: (listener: KeyListener) => Unsubscribe;
  readonly loadUrl: (url: string) => Promise<void>;
  readonly setBackgroundColor: (color: string) => void;
  /** Only for a window created with an overlay. */
  readonly setTitleBarOverlay: (overlay: TitleBarOverlay) => void;
  readonly show: () => void;
  /** Shows the window without activating the app, so it opens behind whatever is in front. */
  readonly showInactive: () => void;
  readonly hide: () => void;
  readonly isVisible: () => boolean;
  /** Calls `listener` after the window was shown or hidden. */
  readonly onVisibilityChanged: (listener: () => void) => Unsubscribe;
  /** Keeps the menu's accelerators from firing while the window's own page has focus, so the page receives every key. */
  readonly setIgnoreMenuShortcuts: (ignore: boolean) => void;
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

export type EntitlementAnswer = Result<
  { readonly token: string },
  EntitlementApiError
>;

export interface EntitlementApi {
  /** Asks for a token for this device; a disabled license is a token, not an error. */
  readonly issue: (request: EntitlementRequest) => Promise<EntitlementAnswer>;
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

/** Whether the operating system asks for dark colours. */
export interface ThemePort {
  readonly dark: () => boolean;
  readonly onChange: (listener: () => void) => Unsubscribe;
}

export const themeOf = (port: ThemePort): Theme =>
  port.dark() ? "dark" : "light";

/** The operating system's handlers for what the app does not open itself. */
export interface ShellPort {
  /** Opens the address in the default browser; rejects when nothing on the system opens it. */
  readonly openExternal: (url: string) => Promise<void>;
}

/** The most of a body a session request reads; a feed or a page past it is not what was asked for. */
export const SESSION_BODY_CAP = 1024 * 1024;

/** What a request answered. A redirect is never followed, so a session sent to sign in costs no request to the sign-in page and a redirect loop costs one. */
export type SessionResponse =
  | {
      readonly kind: "answered";
      readonly status: number;
      readonly text: string;
    }
  | {
      readonly kind: "redirected";
      readonly status: number;
      readonly location: string;
    }
  /** The body passed `SESSION_BODY_CAP`, and was not read further. */
  | { readonly kind: "tooLarge" };

/** The browser sessions panes load in, one partition per profile. */
export interface SessionPort {
  /** Deletes everything the partition stored: cookies, storage and cache. */
  readonly clear: (partition: string) => Promise<void>;
  /** Asks for `url` with the partition's cookies; rejects when the network fails or no answer comes within `timeout` milliseconds. */
  readonly fetchText: (
    partition: string,
    url: string,
    timeout: number
  ) => Promise<SessionResponse>;
}

/** The unread count on the app's icon: the dock's badge, the taskbar's overlay or the launcher's count. */
export interface BadgePort {
  /** Shows `total`, or nothing at none. */
  readonly set: (total: number) => void;
}

export interface NotificationSpec {
  readonly title: string;
  /** Shown under the title on macOS only. */
  readonly subtitle?: string;
  readonly body?: string;
  readonly silent: boolean;
}

/** The operating system's notifications. */
export interface NotificationPort {
  /** Shows a notification, calling `onClick` when it is clicked; does nothing where the system has none. */
  readonly show: (spec: NotificationSpec, onClick: () => void) => void;
}

/** The icon in the menu bar or tray: macOS's template, drawn in the menu bar's own colour, or a coloured one in a shade that reads on the tray. */
export type TrayIcon =
  | { readonly kind: "template" }
  | {
      readonly kind: "tray";
      readonly shade: "light" | "dark";
      readonly unread: boolean;
    };

export type TrayItem =
  | { readonly kind: "item"; readonly label: string; readonly run: () => void }
  | { readonly kind: "separator" }
  | { readonly kind: "quit"; readonly label: string };

export interface TraySpec {
  readonly icon: TrayIcon;
  /** Text beside the icon, which only macOS's menu bar shows. */
  readonly title: string;
  readonly menu: readonly TrayItem[];
}

/** The app's icon in the menu bar or system tray. */
export interface TrayPort {
  /** Shows the icon as `spec` says, putting it up if it is not; `onClick` runs on a click that does not open the menu. */
  readonly show: (spec: TraySpec, onClick: () => void) => void;
  readonly hide: () => void;
}

export interface Ports {
  readonly lifecycle: LifecyclePort;
  readonly clock: Clock;
  readonly fs: FsPort;
  readonly ids: Ids;
  readonly displays: DisplayPort;
  readonly ipc: IpcTransportPort;
  readonly online: OnlinePort;
  readonly power: PowerPort;
  readonly sessions: SessionPort;
  readonly badge: BadgePort;
  readonly notifications: NotificationPort;
  readonly tray: TrayPort;
  readonly shell: ShellPort;
  readonly theme: ThemePort;
  readonly views: ViewFactoryPort;
  readonly windows: WindowFactoryPort;
}

// contextBridge carries plain values and functions only, so the bridge is untyped transport; the client over it takes the channel objects and parses what comes back.
export interface RendererBridge {
  readonly platform: Platform;
  readonly send: (channel: string, payload: unknown) => void;
  readonly invoke: (channel: string, payload: unknown) => Promise<unknown>;
  readonly sendSync: (channel: string, payload: unknown) => unknown;
  readonly on: (
    channel: string,
    listener: (payload: unknown) => void
  ) => Unsubscribe;
}

export const BRIDGE_KEY = "meru";
