import { app } from "electron";

import type { Bitmap } from "#core/badge-image.ts";

import type { AppWindow } from "./window.ts";

export interface BadgeContent {
  count: number;
  /** What the Dock shows. */
  text: string;
  /** The taskbar's overlay on Windows, at each scale it may draw. */
  overlay: readonly Bitmap[];
  /** Read out for the overlay on Windows. */
  description: string;
}

/** The unread count on the app's icon: Dock, taskbar or launcher. */
export interface Badge {
  /** Nothing clears it. */
  show: (content: BadgeContent | undefined) => void;
}

/**
 * The Dock's badge on macOS, the taskbar button's overlay on Windows, and the
 * launcher's count on Linux, which only launchers that read Unity's count
 * show.
 */
export const createBadge = (
  window: Pick<AppWindow, "setOverlayIcon">
): Badge => ({
  show: (content) => {
    switch (process.platform) {
      case "darwin": {
        app.dock?.setBadge(content?.text ?? "");
        break;
      }
      case "win32": {
        window.setOverlayIcon(content?.overlay, content?.description ?? "");
        break;
      }
      default: {
        app.setBadgeCount(content?.count ?? 0);
      }
    }
  },
});

/**
 * The end-to-end build's badge, which never reaches the Dock or taskbar. What
 * it would show is on the main process's global under `meruTestBadge`.
 */
export const createCapturedBadge = (): Badge => ({
  show: (content) => {
    Reflect.set(
      globalThis,
      "meruTestBadge",
      content && {
        count: content.count,
        text: content.text,
        description: content.description,
        overlaySizes: content.overlay.map((bitmap) => bitmap.width),
      }
    );
  },
});
