import type { SWIPE_NAVIGATION_TUNING } from "./tuning";

/**
 * Which edge the bubble comes in at, which is the direction the content travels
 * under the fingers: `left` uncovers what came before the page, `right` what
 * comes after it.
 */
export type SwipeDirection = "left" | "right";

export type SwipeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SwipeBeginRequest = {
  /**
   * The event window's content view, the same `NSView*` a window's
   * `getNativeWindowHandle()` holds.
   */
  windowHandle: Buffer;

  /** Where the pointer is in the window, in top-left-origin points. */
  x: number;

  y: number;

  direction: SwipeDirection;
};

/** The view a swipe belongs to, in the window coordinates the bubble is drawn in. */
export type SwipeTarget = SwipeBounds & {
  /** Echoed back on progress and at the end, so the caller can find the view again. */
  id: number;
};

export type SwipeNavigationAddonOptions = typeof SWIPE_NAVIGATION_TUNING & {
  /**
   * Answers whether the gesture should navigate, with the target view, or
   * nothing to leave the scrolling to the page. Called while the event waits to
   * be delivered, so it must not await anything.
   */
  onBegin: (request: SwipeBeginRequest) => SwipeTarget | undefined;

  /** Left out unless something is listening, since it runs once a frame. */
  onProgress?: (id: number, progress: number) => void;

  onEnd: (id: number, direction: SwipeDirection, committed: boolean, maxProgress: number) => void;
};

export type SwipeNavigationAddon = {
  /** The "Swipe between pages" setting in System Settings. */
  isSwipeTrackingEnabled: () => boolean;

  start: (options: SwipeNavigationAddonOptions) => void;

  stop: () => void;

  /**
   * Puts the bubble up at a fixed progress with no gesture, for a machine that
   * has no trackpad to make one with. `false` when no window has that handle.
   */
  showOverlay: (
    windowHandle: Buffer,
    bounds: SwipeBounds,
    direction: SwipeDirection,
    progress: number,
  ) => boolean;

  hideOverlay: () => void;
};
