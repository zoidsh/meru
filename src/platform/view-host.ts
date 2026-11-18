import { BaseWindow } from "electron";

/**
 * A window views can be put in: the main window or a tab's own. Named by
 * its id alone, so a feature's fake makes one without Electron.
 */
export interface ViewHost {
  readonly hostId: number;
}

export const viewHost = (window: BaseWindow): ViewHost => ({
  hostId: window.id,
});

/** The window, while it is open. */
export const hostWindow = ({ hostId }: ViewHost): BaseWindow | undefined => {
  const window = BaseWindow.fromId(hostId);

  return window && !window.isDestroyed() ? window : undefined;
};
