import type { ZoomChange } from "#platform/zoom.ts";

export interface ZoomDeps {
  /** Zooms the web contents with focus if `accepts` takes its id; says whether it did. */
  zoomFocused: (
    change: ZoomChange,
    accepts: (webContentsId: number) => boolean
  ) => boolean;
  /** Whether the id is one of the shell's documents: the overlay or a window's titlebar. */
  isShellDocument: (webContentsId: number) => boolean;
  /** Zooms the page a shell document sits over or beside. */
  zoomPage: (change: ZoomChange) => void;
}

/**
 * Actual Size, Zoom In and Zoom Out: the tab's page or the shell, whichever
 * has focus, as the zoom roles do. A shell document never zooms, since its
 * view does not grow with it; the page it serves does instead.
 */
export const createZoom =
  ({ zoomFocused, isShellDocument, zoomPage }: ZoomDeps) =>
  (change: ZoomChange) => {
    if (!zoomFocused(change, (id) => !isShellDocument(id))) {
      zoomPage(change);
    }
  };
