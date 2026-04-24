import { is } from "@electron-toolkit/utils";
import type { WebContents, WebContentsView } from "electron";
import { ipc } from "@/ipc";

export function applyViewZoomLimits(view: WebContentsView) {
  view.webContents.on("dom-ready", () => {
    view.webContents.setVisualZoomLevelLimits(1, 3);
  });
}

export function openViewDevToolsInDev(view: WebContentsView) {
  if (is.dev) {
    view.webContents.openDevTools({ mode: "bottom" });
  }
}

export function broadcastFoundInPageResults(view: WebContentsView, target: WebContents) {
  view.webContents.on("found-in-page", (_event, result) => {
    ipc.renderer.send(target, "findInPage.result", {
      activeMatch: result.activeMatchOrdinal,
      totalMatches: result.matches,
    });
  });
}
