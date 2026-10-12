import type { BrowserWindow } from "electron";
import { serializeError } from "serialize-error";
import { accounts } from "@/accounts";
import { log } from "@/lib/log";
import { main } from "@/main";
import { WorkspaceApp } from "@/workspace-app";

/**
 * The view a window-level command acts on: the workspace app a windowed tab
 * shows, or the selected account's active tab, which falls back to its Gmail
 * view while a dormant tab is still being materialized.
 */
export function getActiveView(window: BrowserWindow | null) {
  if (window && window !== main.window) {
    const workspaceApp = WorkspaceApp.tryFromWebContents(window.webContents);

    if (workspaceApp) {
      return workspaceApp.view;
    }
  }

  const selectedAccount = accounts.getSelectedAccount();

  return selectedAccount.instance.tabs.activeTab.view ?? selectedAccount.instance.gmail.view;
}

/**
 * Electron reports AppKit's navigation swipe without acting on it. A
 * three-finger trackpad swipe sends it, and so do mouse drivers such as Logi
 * Options+ in place of the back and forward buttons.
 */
export function navigateOnSwipe(window: BrowserWindow) {
  window.on("swipe", (_event, direction) => {
    // Every view is hidden away from `/`, so a renderer page is showing.
    if (window === main.window && main.location !== "/") {
      return;
    }

    try {
      const { navigationHistory } = getActiveView(window).webContents;

      // Electron names the direction after the sign of AppKit's deltaX, where
      // 1 means back, so "left" is back.
      if (direction === "left") {
        navigationHistory.goBack();
      } else if (direction === "right") {
        navigationHistory.goForward();
      }
    } catch (error) {
      // Thrown while there is no account to act on, such as in the repair that
      // follows disabling the last enabled one.
      log.error("Could not navigate on a swipe", serializeError(error));
    }
  });
}
