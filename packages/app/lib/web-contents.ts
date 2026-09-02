import {
  type Session,
  type WebContents,
  WebContentsView,
  type WebContentsViewConstructorOptions,
} from "electron";
import { setupWindowContextMenu } from "@/context-menu";
import { ipc } from "@/ipc";
import { shouldOpenDevToolsOnLaunch } from "./dev-tools";
import { isLoadFailureWorthLogging } from "./load-failures";
import { log } from "./log";

/**
 * Says why a view is empty. A load that never arrives leaves nothing behind on
 * its own: the renderer that died, the frame that was refused and the error the
 * network stack gave up with are all only in these events.
 */
export function logLoadFailures(webContents: WebContents, name: string) {
  webContents.on("render-process-gone", (_event, { reason, exitCode }) => {
    log.error(`${name} renderer is gone`, { reason, exitCode });
  });

  webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isLoadFailureWorthLogging(errorCode, isMainFrame)) {
        return;
      }

      log.error(`${name} failed to load`, {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
      });
    },
  );

  webContents.on(
    "did-fail-provisional-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      log.error(`${name} failed to start loading`, {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
      });
    },
  );
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
 * this destroyed webContents, on quit for example.
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
