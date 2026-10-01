import { platform } from "@electron-toolkit/utils";
import { PAGE_AT_BOTH_EDGES, type PageScrollEdge } from "@meru/shared/scroll-edge";
import {
  decideSwipeBegin,
  isPointInBounds,
  loadSwipeNavigationAddon,
  SWIPE_NAVIGATION_TUNING,
  type SwipeBeginRequest,
  type SwipeDirection,
  type SwipeNavigationAction,
  type SwipeNavigationAddon,
} from "@meru/swipe-navigation";
import { BrowserWindow, type WebContents } from "electron";
import { serializeError } from "serialize-error";
import { getActiveView } from "@/active-view";
import { config } from "@/config";
import { log } from "@/lib/log";
import { Popup } from "@/lib/popup";
import { main } from "@/main";
import { WorkspaceApp } from "@/workspace-app";

/** `MERU_SWIPE_NAVIGATION_PREVIEW=left:0.5` and the like. */
const PREVIEW_PATTERN = /^(?<direction>left|right):(?<progress>[\d.]+)$/;

class SwipeNavigation {
  /**
   * Weak, so a closed tab's entry goes with it: the gesture is answered from
   * this cache, and nothing else reads it.
   */
  private pageScrollEdges = new WeakMap<WebContents, PageScrollEdge>();

  private gesture: { webContents: WebContents; action: SwipeNavigationAction } | undefined;

  /**
   * `MERU_SWIPE_NAVIGATION_DEBUG=true` raises every gesture line to info and
   * adds one per frame, so a report of a gesture that felt wrong carries the
   * amounts it reached.
   */
  private isVerbose = process.env.MERU_SWIPE_NAVIGATION_DEBUG === "true";

  private logGesture(message: string, details: Record<string, unknown>) {
    if (this.isVerbose) {
      log.info(`Swipe: ${message}`, details);
    } else {
      log.debug(`Swipe: ${message}`, details);
    }
  }

  setPageScrollEdge(webContents: WebContents, pageScrollEdge: PageScrollEdge) {
    this.pageScrollEdges.set(webContents, pageScrollEdge);
  }

  private findWindow(windowHandle: Buffer) {
    return BrowserWindow.getAllWindows().find((window) =>
      window.getNativeWindowHandle().equals(windowHandle),
    );
  }

  private handleBegin = (request: SwipeBeginRequest) => {
    const { direction, x, y } = request;

    try {
      if (request.whileSettling) {
        this.logGesture("began while the last swipe was still settling", { direction });
      }

      const window = this.findWindow(request.windowHandle);

      if (!window) {
        this.logGesture("refused", { direction, refusedBecause: "noWindow" });

        return undefined;
      }

      const isViewWindow =
        window === main.window
          ? // Every view is hidden away from `/`, so a renderer page is showing
            // and there is nothing under the pointer to navigate.
            main.location === "/"
          : // A compose or screen-share window draws its own page and holds no
            // view, and the selected account's view is not in it to navigate.
            Boolean(WorkspaceApp.tryFromWebContents(window.webContents));

      if (!isViewWindow) {
        this.logGesture("refused", { direction, refusedBecause: "noView" });

        return undefined;
      }

      const view = getActiveView(window);

      const bounds = view.getBounds();

      if (!isPointInBounds({ x, y }, bounds)) {
        this.logGesture("refused", { direction, refusedBecause: "pointerOutsideView" });

        return undefined;
      }

      const isPointOverPopup = Popup.getOpenBoundsIn(window).some((popupBounds) =>
        isPointInBounds({ x, y }, popupBounds),
      );

      if (isPointOverPopup) {
        this.logGesture("refused", { direction, refusedBecause: "pointerOverPopup" });

        return undefined;
      }

      const { webContents } = view;

      const decision = decideSwipeBegin({
        direction,
        canGoBack: webContents.navigationHistory.canGoBack(),
        canGoForward: webContents.navigationHistory.canGoForward(),
        pageScrollEdge: this.pageScrollEdges.get(webContents) ?? PAGE_AT_BOTH_EDGES,
      });

      if ("refusedBecause" in decision) {
        this.logGesture("refused", { direction, refusedBecause: decision.refusedBecause });

        return undefined;
      }

      this.gesture = { webContents, action: decision.action };

      this.logGesture("began", { direction, action: decision.action, url: webContents.getURL() });

      return { id: webContents.id, ...bounds };
    } catch (error) {
      // Thrown from the moments when there is no account to act on, such as the
      // repair that follows disabling the last enabled one. Nothing may escape:
      // the addon calls in from an AppKit event monitor, where a throw reaches
      // Node's uncaught handling rather than a caller.
      log.error("Swipe navigation could not answer a gesture", serializeError(error));

      this.logGesture("refused", { direction, refusedBecause: "noView" });

      return undefined;
    }
  };

  private handleProgress = (id: number, progress: number) => {
    log.info("Swipe: progress", { id, progress });
  };

  private handleEnd = (
    id: number,
    direction: SwipeDirection,
    committed: boolean,
    maxProgress: number,
  ) => {
    const gesture = this.gesture;

    this.gesture = undefined;

    try {
      this.logGesture(committed ? "committed" : "cancelled", {
        direction,
        action: gesture?.action,
        maxProgress,
      });

      // A tab closed mid-gesture leaves a webContents that throws on every
      // property, `id` included, so it is asked whether it is still there first.
      if (!committed || !gesture || gesture.webContents.isDestroyed()) {
        return;
      }

      if (gesture.webContents.id !== id) {
        return;
      }

      if (gesture.action === "back") {
        gesture.webContents.navigationHistory.goBack();
      } else {
        gesture.webContents.navigationHistory.goForward();
      }
    } catch (error) {
      log.error("Swipe navigation could not finish a gesture", serializeError(error));
    }
  };

  /**
   * Puts the bubble up on the active view and leaves it there, which is the only
   * way to see how it looks on a machine with no trackpad. A window that answers
   * the handle also proves that the pointer Electron hands out and the one a
   * scroll event carries name the same view.
   */
  private showPreviewOverlay(addon: SwipeNavigationAddon) {
    const preview = PREVIEW_PATTERN.exec(process.env.MERU_SWIPE_NAVIGATION_PREVIEW ?? "");

    if (!preview?.groups) {
      return;
    }

    const direction = preview.groups.direction as SwipeDirection;
    const progress = Number(preview.groups.progress);

    main.rendererReady.then(() => {
      const shown = addon.showOverlay(
        main.window.getNativeWindowHandle(),
        getActiveView(main.window).getBounds(),
        direction,
        progress,
      );

      log.info("Swipe: preview", { direction, progress, shown });
    });
  }

  private start(addon: SwipeNavigationAddon) {
    // Startup goes on past this point, so swiping is the most a failure here
    // may cost.
    try {
      addon.start({
        ...SWIPE_NAVIGATION_TUNING,
        onBegin: this.handleBegin,
        onEnd: this.handleEnd,
        ...(this.isVerbose && { onProgress: this.handleProgress }),
      });
    } catch (error) {
      log.error("Swipe navigation is unavailable", serializeError(error));

      return;
    }

    log.info("Swipe navigation is ready", {
      swipeTrackingEnabled: addon.isSwipeTrackingEnabled(),
    });
  }

  private stop(addon: SwipeNavigationAddon) {
    addon.stop();

    this.gesture = undefined;

    log.info("Swipe navigation is off");
  }

  init() {
    if (!platform.isMacOS) {
      return;
    }

    let addon: SwipeNavigationAddon;

    try {
      addon = loadSwipeNavigationAddon(__dirname);
    } catch (error) {
      log.error("Swipe navigation is unavailable", serializeError(error));

      return;
    }

    if (config.get("swipeNavigation.enabled")) {
      this.start(addon);
    }

    config.onDidChange("swipeNavigation.enabled", (enabled) => {
      if (enabled) {
        this.start(addon);
      } else {
        this.stop(addon);
      }
    });

    this.showPreviewOverlay(addon);
  }
}

export const swipeNavigation = new SwipeNavigation();
