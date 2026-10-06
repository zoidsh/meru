import type { Session } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import type { ExtensionsLogger } from "../logger";
import { WINDOWS_PATHS, type WindowsCreateInfo, type WindowsWindow } from "./bridge-protocol";

/**
 * SPIKE: `chrome.windows.create` and `remove`, opening the extension's own page
 * in a real window of the calling session.
 *
 * Only a `chrome-extension://` URL of the calling extension is opened. A
 * `windows.create` carrying a web URL is what Proton Pass's sign-in handoff
 * needs and is a different decision — a window outside every account's session
 * with no blocker, no user agent and no permission handler on it — so it is
 * refused here rather than silently opened.
 */
export type ExtensionWindow = {
  id: number;
  focus: () => void;
  close: () => void;
  getBounds: () => { x: number; y: number; width: number; height: number };
  isDestroyed: () => boolean;
};

export type WindowsOptions = {
  /**
   * Opens a window of the embedder's own making, loading the URL in the session
   * the extension is loaded into. The loader cannot do this itself: a window is
   * the app's — its chrome, its parent, where it is placed, what closes it.
   */
  openWindow?: (details: {
    session: Session;
    extensionId: string;
    url: string;
    width: number;
    height: number;
  }) => ExtensionWindow | undefined;
  logger: ExtensionsLogger | undefined;
};

const DEFAULT_WIDTH = 380;

const DEFAULT_HEIGHT = 630;

export class Windows {
  private openWindow: WindowsOptions["openWindow"];

  private logger: ExtensionsLogger | undefined;

  private windows = new Map<number, ExtensionWindow>();

  constructor({ openWindow, logger }: WindowsOptions) {
    this.openWindow = openWindow;

    this.logger = logger;
  }

  registerRoutes(bridge: ExtensionBridge) {
    bridge.handle(WINDOWS_PATHS.create, ({ session, extensionId, body, headers }) =>
      Response.json(this.create(session, extensionId, body.createData as WindowsCreateInfo), {
        headers,
      }),
    );

    bridge.handle(WINDOWS_PATHS.remove, ({ body, headers }) => {
      this.remove(body.windowId);

      return Response.json(null, { headers });
    });
  }

  create(
    session: Session,
    extensionId: string,
    createData: WindowsCreateInfo | undefined,
  ): WindowsWindow | null {
    const url = typeof createData?.url === "string" ? createData.url : undefined;

    if (!url || !this.openWindow) {
      return null;
    }

    const absoluteUrl = url.startsWith("chrome-extension://")
      ? url
      : `chrome-extension://${extensionId}/${url.replace(/^\//, "")}`;

    if (!absoluteUrl.startsWith(`chrome-extension://${extensionId}/`)) {
      this.logger?.info("Refused a windows.create for a URL outside the extension", {
        extensionId,
        url,
      });

      return null;
    }

    const width = typeof createData?.width === "number" ? createData.width : DEFAULT_WIDTH;

    const height = typeof createData?.height === "number" ? createData.height : DEFAULT_HEIGHT;

    const window = this.openWindow({ session, extensionId, url: absoluteUrl, width, height });

    if (!window) {
      return null;
    }

    this.windows.set(window.id, window);

    const bounds = window.getBounds();

    return {
      id: window.id,
      focused: true,
      incognito: false,
      alwaysOnTop: false,
      state: "normal",
      type: "popup",
      top: bounds.y,
      left: bounds.x,
      width: bounds.width,
      height: bounds.height,
      tabs: [],
    };
  }

  remove(windowId: unknown) {
    if (typeof windowId !== "number") {
      return;
    }

    const window = this.windows.get(windowId);

    this.windows.delete(windowId);

    if (window && !window.isDestroyed()) {
      window.close();
    }
  }
}
