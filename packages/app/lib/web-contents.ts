import { TAB_VIEW_BORDER_RADIUS } from "@meru/shared/constants";
import {
  type Session,
  type WebContents,
  WebContentsView,
  type WebContentsViewConstructorOptions,
} from "electron";
import { setupWindowContextMenu } from "@/context-menu";
import { ipc } from "@/ipc";
import { shouldOpenDevToolsOnLaunch } from "./dev-tools";

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

  view.setBorderRadius(TAB_VIEW_BORDER_RADIUS);

  attachView(view);

  setupWindowContextMenu(view);

  applyViewZoomLimits(view);

  broadcastFoundInPageResults(view, getFindInPageTargetWebContents);

  registerWindowOpenHandler(view);

  return view;
}
