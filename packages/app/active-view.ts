import type { BrowserWindow } from "electron";
import { accounts } from "@/accounts";
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
