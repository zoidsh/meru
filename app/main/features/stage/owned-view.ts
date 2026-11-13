import type { ViewPort } from "../../../core/ports.ts";

/** A view the stage made, with what takes it down: the listeners it holds and the view itself. */
export interface OwnedView {
  readonly view: ViewPort;
  readonly dispose: () => void;
}

/** The background of a view the panes show through. */
export const TRANSPARENT = "#00000000";

/** Loads `url` into the view, reporting a failure rather than throwing it; true once the page has loaded. */
export const loadOwned = async (
  view: ViewPort,
  url: string,
  onError: (error: unknown) => void
): Promise<boolean> => {
  try {
    await view.loadURL(url);
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
};
