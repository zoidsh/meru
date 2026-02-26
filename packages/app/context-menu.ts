import type { BrowserWindow, WebContentsView } from "electron";
import electronContextMenu from "electron-context-menu";

export function setupWindowContextMenu(window: BrowserWindow | WebContentsView) {
  electronContextMenu({
    window,
    showCopyImageAddress: true,
    showSaveImageAs: true,
    showInspectElement: false,
    showCopyEmailAddress: true,
    append: (_defaultActions, parameters) => [
      {
        label: "Inspect Element",
        click: () => {
          window.webContents.inspectElement(parameters.x, parameters.y);

          if (window.webContents.isDevToolsOpened()) {
            window.webContents.devToolsWebContents?.focus();
          }
        },
      },
    ],
  });
}
