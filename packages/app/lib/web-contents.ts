import {
  type Session,
  type WebContents,
  WebContentsView,
  type WebContentsViewConstructorOptions,
} from "electron";
import { serializeError } from "serialize-error";
import { setupWindowContextMenu } from "@/context-menu";
import { ipc } from "@/ipc";
import { shouldOpenDevToolsOnLaunch } from "./dev-tools";
import { log } from "./log";

/**
 * `loadURL` rejects when the load never commits — a renderer that went away
 * mid-navigation, a network stack that gave up — and nothing waits on the
 * promise, which turns every such load into an unhandled rejection. There is
 * nothing to do about a failed load beyond saying what happened.
 */
export function loadUrl(webContents: WebContents, url: string) {
  return webContents.loadURL(url).catch((error: unknown) => {
    log.error("Failed to load URL", { url, error: serializeError(error) });
  });
}

export function applyViewZoomLimits(view: WebContentsView) {
  view.webContents.on("dom-ready", () => {
    view.webContents.setVisualZoomLevelLimits(1, 3);
  });
}

export function openViewDevToolsOnLaunch(view: WebContentsView) {
  if (shouldOpenDevToolsOnLaunch) {
    view.webContents.openDevTools({ mode: "bottom" });
  }
}

export function broadcastFoundInPageResults(
  view: WebContentsView,
  getTargetWebContents: () => WebContents,
) {
  view.webContents.on("found-in-page", (_event, result) => {
    ipc.renderer.send(getTargetWebContents(), "findInPage.result", {
      activeMatch: result.activeMatchOrdinal,
      totalMatches: result.matches,
    });
  });
}

/**
 * Takes down every listener on a webContents except `"destroyed"`: Electron
 * pairs a "destroyed" listener on a webContents with a
 * "current-render-view-deleted" listener on its opener when the view was
 * created via a window open handler. Removing the "destroyed" listener leaves
 * the opener-side listener dangling, which then crashes the app by calling into
 * this destroyed webContents (e.g. on quit).
 */
export function removeWebContentsListeners(webContents: WebContents) {
  for (const registeredEvent of webContents.eventNames()) {
    if (registeredEvent !== "destroyed") {
      webContents.removeAllListeners(registeredEvent);
    }
  }
}

export function createChildWebContentsView({
  session,
  preload,
  additionalArguments,
  viewOptions,
  attachView,
  getFindInPageTargetWebContents,
  registerWindowOpenHandler,
}: {
  session: Session;
  preload: string;
  additionalArguments?: string[];
  viewOptions?: WebContentsViewConstructorOptions;
  attachView: (view: WebContentsView) => void;
  getFindInPageTargetWebContents: () => WebContents;
  registerWindowOpenHandler: (view: WebContentsView) => void;
}) {
  const view = new WebContentsView({
    ...viewOptions,
    webPreferences: {
      ...(additionalArguments && { additionalArguments }),
      ...viewOptions?.webPreferences,
      session,
      preload,
    },
  });

  attachView(view);

  setupWindowContextMenu(view);

  applyViewZoomLimits(view);

  broadcastFoundInPageResults(view, getFindInPageTargetWebContents);

  registerWindowOpenHandler(view);

  return view;
}
