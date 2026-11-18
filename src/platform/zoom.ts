import { webContents } from "electron";
import type { WebContents } from "electron";

export type ZoomChange = "in" | "out" | "reset";

/** Steps the zoom of `contents` as Electron's zoom roles do. */
export const zoomContents = (contents: WebContents, change: ZoomChange) => {
  contents.setZoomLevel(
    change === "reset"
      ? 0
      : contents.getZoomLevel() + (change === "in" ? 0.5 : -0.5)
  );
};

/**
 * Zooms the web contents with focus when `accepts` takes its id, as the
 * zoom roles would, and answers whether it did; with none focused, or one
 * refused, it zooms nothing.
 */
export const zoomFocused = (
  change: ZoomChange,
  accepts: (webContentsId: number) => boolean
) => {
  const focused = webContents.getFocusedWebContents();

  if (!focused || !accepts(focused.id)) {
    return false;
  }

  zoomContents(focused, change);

  return true;
};
