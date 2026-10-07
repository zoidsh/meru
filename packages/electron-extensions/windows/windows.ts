import type { WebFrameMain } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import type { ExtensionsLogger } from "../logger";
import {
  MAIN_WINDOW_ID,
  WINDOW_ID_CURRENT,
  WINDOWS_PATHS,
  type WindowsCreateData,
  type WindowsWindow,
  type WindowsWindowResponse,
} from "./bridge-protocol";

/**
 * The first id handed out. 1 is the fake window the facade answers with for
 * everything this class does not serve (`facade/api/windows.ts`), and an
 * embedder's own window ids start there too — Electron's do — so the ids here
 * are the loader's alone and name nothing outside it.
 */
const FIRST_WINDOW_ID = MAIN_WINDOW_ID + 1;

/**
 * A window the embedder opened, which is as much of one as this module holds:
 * where it is, whether it is still there, and how to focus or close it.
 * Everything a window actually is — its chrome, which display it lands on,
 * what closes it with the app — is the embedder's.
 */
export type ExtensionWindow = {
  focus: () => void;
  close: () => void;
  isDestroyed: () => boolean;
  isFocused: () => boolean;
  getBounds: () => { x: number; y: number; width: number; height: number };
  /**
   * Whether the frame is this window's own page, which is how a `getCurrent`
   * from inside the window finds the window it runs in: the bridge names the
   * calling frame, and nothing else ties a frame to a window.
   */
  containsFrame: (frame: WebFrameMain) => boolean;
  /** Called once the window is gone, however it went, so the map drops it. */
  onClosed: (listener: () => void) => void;
};

export type ExtensionWindowOpenDetails = {
  extensionId: string;
  /** Always an absolute `chrome-extension://<extensionId>/` URL; see `create`. */
  url: string;
  /** Only ever a finite number, the extension's own value being untrusted. */
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  /** What the extension asked for, for an embedder that draws the two apart. */
  type: "popup" | "normal";
};

export type ExtensionWindowsPolicy = (extensionId: string) => boolean;

export type WindowsOptions = {
  /**
   * Which extensions may open a window, by the id they are loaded as. Without
   * it none may, which is the facade's noop and what every extension the
   * embedder has not promoted keeps.
   */
  canOpenWindows?: ExtensionWindowsPolicy;
  /**
   * Opens one, or nothing when the embedder will not. The loader cannot do this
   * itself: a window is the app's — its chrome, its session, where it is placed
   * — and the loader holds no Electron value at all.
   */
  openWindow?: (details: ExtensionWindowOpenDetails) => ExtensionWindow | undefined;
  logger?: ExtensionsLogger;
};

type TrackedExtensionWindow = {
  extensionId: string;
  /** What it was opened for, which is what a second `create` dedupes on. */
  url: string;
  type: "popup" | "normal";
  window: ExtensionWindow;
};

/**
 * `chrome.windows.create`, `remove` and `get`, for the extensions an embedder
 * opted in and for their own pages alone.
 *
 * A password manager's unlock and sign-in surfaces are `windows.create`
 * popouts of its own pages, so the facade's noop leaves it no way in at all —
 * it opens nothing, answers a window id that names nothing, and the extension
 * waits on a page that never appeared. What the opt-in buys is everything else
 * keeping exactly that behavior: an extension written for a browser reaches
 * through this call for windows an embedder has no equivalent of, and a
 * half-working one is worse than the noop it has today.
 *
 * Only a `chrome-extension://` URL of the calling extension is ever opened. A
 * web URL would be a browser window with none of the embedder's own handling on
 * it — no request blocking, no permission handler, no user agent — which is a
 * separate decision rather than a detail of this one, so it is refused out
 * loud instead of quietly opened.
 *
 * The ids are this module's own and the extension each window was opened for is
 * remembered with it, so nothing an extension is told names a window of the
 * embedder's and no `remove` or `get` reaches another extension's window.
 */
export class Windows {
  private canOpenWindows: ExtensionWindowsPolicy | undefined;

  private openWindow: WindowsOptions["openWindow"];

  private logger: ExtensionsLogger | undefined;

  private windows = new Map<number, TrackedExtensionWindow>();

  private nextWindowId = FIRST_WINDOW_ID;

  constructor({ canOpenWindows, openWindow, logger }: WindowsOptions = {}) {
    this.canOpenWindows = canOpenWindows;

    this.openWindow = openWindow;

    this.logger = logger;
  }

  registerRoutes(bridge: ExtensionBridge) {
    bridge.handle(WINDOWS_PATHS.create, ({ extensionId, body, headers }) =>
      Response.json(this.create(extensionId, body.createData as WindowsCreateData | undefined), {
        headers,
      }),
    );

    bridge.handle(WINDOWS_PATHS.remove, ({ extensionId, senderFrame, body, headers }) => {
      this.remove(extensionId, body.windowId, senderFrame);

      return Response.json(null, { headers });
    });

    bridge.handle(WINDOWS_PATHS.get, ({ extensionId, senderFrame, body, headers }) =>
      Response.json(this.get(extensionId, body.windowId, senderFrame), { headers }),
    );
  }

  /**
   * One window per URL, since an extension that opens its unlock popout from
   * two places at once — the inline menu and its own page — means one unlock
   * rather than two windows of it. The one already open is focused and answered
   * with, which is what Chrome's own popout helpers do with the window they
   * find.
   */
  create(extensionId: string, createData: WindowsCreateData | undefined): WindowsWindowResponse {
    const { openWindow } = this;

    if (!openWindow || this.canOpenWindows?.(extensionId) !== true) {
      return { window: null };
    }

    const url = resolveExtensionUrl(extensionId, createData?.url);

    if (!url) {
      this.logger?.info("Refused an extension window outside the extension", {
        extensionId,
        url: createData?.url,
      });

      return { window: null, error: "Only the extension's own pages can be opened in a window." };
    }

    const openWindowId = this.findWindowId(
      (tracked) => tracked.extensionId === extensionId && tracked.url === url,
    );

    if (openWindowId !== undefined) {
      const tracked = this.windows.get(openWindowId) as TrackedExtensionWindow;

      tracked.window.focus();

      return { window: describeWindow(openWindowId, tracked) };
    }

    const type = createData?.type === "popup" ? "popup" : "normal";

    const window = openWindow({
      extensionId,
      url,
      width: readBound(createData?.width),
      height: readBound(createData?.height),
      left: readBound(createData?.left),
      top: readBound(createData?.top),
      type,
    });

    if (!window) {
      return { window: null };
    }

    const windowId = this.nextWindowId;

    this.nextWindowId += 1;

    const tracked: TrackedExtensionWindow = { extensionId, url, type, window };

    this.windows.set(windowId, tracked);

    window.onClosed(() => {
      // Only this window's own entry: an id is never reused, so a later entry
      // under the same id is impossible, but the window may already have been
      // dropped by a `remove` or an unload
      if (this.windows.get(windowId) === tracked) {
        this.windows.delete(windowId);
      }
    });

    return { window: describeWindow(windowId, tracked) };
  }

  /**
   * Chrome's `remove` resolves with nothing, so a window that is not this
   * extension's — or not one of ours at all, which is every id while the
   * facade still answers the fake window — is left alone silently rather than
   * reported, the way the noop behaved.
   */
  remove(extensionId: string, windowId: unknown, senderFrame?: WebFrameMain) {
    if (typeof windowId !== "number") {
      return;
    }

    const removedWindowId =
      windowId === WINDOW_ID_CURRENT
        ? this.get(extensionId, windowId, senderFrame).window?.id
        : windowId;

    if (removedWindowId === undefined) {
      return;
    }

    const tracked = this.windows.get(removedWindowId);

    if (!tracked || tracked.extensionId !== extensionId) {
      return;
    }

    this.windows.delete(removedWindowId);

    if (!tracked.window.isDestroyed()) {
      tracked.window.close();
    }
  }

  /**
   * A window of this extension by id, or — with no id, which is what
   * `getCurrent` asks, or `WINDOW_ID_CURRENT` — the one the calling frame is
   * the page of.
   */
  get(
    extensionId: string,
    windowId: unknown,
    senderFrame: WebFrameMain | undefined,
  ): WindowsWindowResponse {
    const foundWindowId = this.findWindowId((tracked, trackedWindowId) => {
      if (tracked.extensionId !== extensionId) {
        return false;
      }

      return typeof windowId === "number" && windowId !== WINDOW_ID_CURRENT
        ? trackedWindowId === windowId
        : senderFrame !== undefined && tracked.window.containsFrame(senderFrame);
    });

    if (foundWindowId === undefined) {
      return { window: null };
    }

    return {
      window: describeWindow(
        foundWindowId,
        this.windows.get(foundWindowId) as TrackedExtensionWindow,
      ),
    };
  }

  /**
   * The window a frame's page is in: one this class opened, or the window
   * every other page is in. Any extension's, since a tab's `windowId` is the
   * same whoever asks about it.
   */
  getWindowIdOfFrame(frame: WebFrameMain): number {
    return this.findWindowId((tracked) => tracked.window.containsFrame(frame)) ?? MAIN_WINDOW_ID;
  }

  /**
   * What unloading an extension takes with it: the page a window holds is about
   * to stop existing — an uninstall deletes the copy it was loaded from — so a
   * window left open would be a window of nothing.
   */
  closeExtensionWindows(extensionId: string) {
    for (const [windowId, tracked] of this.windows) {
      if (tracked.extensionId !== extensionId) {
        continue;
      }

      this.windows.delete(windowId);

      if (!tracked.window.isDestroyed()) {
        tracked.window.close();
      }
    }
  }

  /**
   * The id of the first window the predicate holds for, dropping whatever the
   * embedder has already destroyed without telling us on the way past: a window
   * gone without its `onClosed` must not be focused, answered or deduped
   * against.
   */
  private findWindowId(
    matches: (tracked: TrackedExtensionWindow, windowId: number) => boolean,
  ): number | undefined {
    for (const [windowId, tracked] of this.windows) {
      if (tracked.window.isDestroyed()) {
        this.windows.delete(windowId);

        continue;
      }

      if (matches(tracked, windowId)) {
        return windowId;
      }
    }

    return undefined;
  }
}

/**
 * The absolute URL to open, or nothing for anything that is not a page of this
 * extension. Chrome resolves a relative URL against the extension's own origin,
 * which is the form `windows.create` is called in.
 *
 * Compared on the parsed URL rather than on the string, since a prefix test
 * passes for `chrome-extension://<id>@evil.example/`, whose host is what
 * follows the `@`. `URL.origin` is no use for it, being `"null"` for every
 * scheme the URL standard does not call special, `chrome-extension:` among them
 * — the same comparison `getActionPopupUrl` makes for the same reason.
 */
function resolveExtensionUrl(extensionId: string, url: unknown) {
  // Chrome takes an array of URLs too, one tab per entry, and a window here
  // holds one page — so the first is what it opens
  const askedUrl = Array.isArray(url) ? url[0] : url;

  if (typeof askedUrl !== "string") {
    return undefined;
  }

  const absoluteUrl = URL.parse(askedUrl, `chrome-extension://${extensionId}/`);

  if (absoluteUrl?.protocol !== "chrome-extension:" || absoluteUrl.host !== extensionId) {
    return undefined;
  }

  return absoluteUrl.href;
}

/** Passed on only as a number the embedder can place a window by. */
function readBound(bound: unknown) {
  return typeof bound === "number" && Number.isFinite(bound) ? bound : undefined;
}

function describeWindow(windowId: number, tracked: TrackedExtensionWindow): WindowsWindow {
  const bounds = tracked.window.getBounds();

  return {
    id: windowId,
    focused: tracked.window.isFocused(),
    incognito: false,
    alwaysOnTop: false,
    state: "normal",
    type: tracked.type,
    top: bounds.y,
    left: bounds.x,
    width: bounds.width,
    height: bounds.height,
    tabs: [],
  };
}
