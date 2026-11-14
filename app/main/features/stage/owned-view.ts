import type { LogPort } from "../../../core/log.ts";
import type { ViewPort } from "../../../core/ports.ts";
import type { PageHistory } from "../../../core/records/navigation.ts";

/** A view the stage made, with what takes it down: the listeners it holds and the view itself. */
export interface OwnedView {
  readonly view: ViewPort;
  readonly dispose: () => void;
}

// A page that sets no background of its own, as some of Google's do, paints the view's colour, and assumes a browser's white canvas.
/** The background of a pane's view, whatever the theme. */
export const CANVAS = "#ffffff";

/** The background of a view the panes show through. */
export const TRANSPARENT = "#00000000";

/** Loads `url` into the view, or its page where `history` left it, logging a failure rather than throwing it; true once the page has loaded. */
export const loadOwned = async (
  view: ViewPort,
  url: string,
  log: LogPort,
  history?: PageHistory
): Promise<boolean> => {
  try {
    await (history === undefined ? view.loadURL(url) : view.restore(history));
    return true;
  } catch (error) {
    log.error("Could not load a page into a view", { error, url });
    return false;
  }
};
