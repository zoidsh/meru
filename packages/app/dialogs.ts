import { WEBSITE_URL } from "@meru/shared/constants";
import { type SupportedWorkspaceApp, workspaceApps } from "@meru/shared/workspace-apps";
import { app, dialog } from "electron";
import { relaunchApp } from "@/lib/relaunch";
import { config } from "./config";
import { main } from "./main";
import { openExternalUrl } from "./url";

export async function showRestartDialog() {
  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: ["Restart", "Later"],
    message: "Restart Meru to apply the changes.",
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    relaunchApp();
    app.quit();
  }
}

export async function showUnsupportedMacOSDialog() {
  const { checkboxChecked } = await dialog.showMessageBox(main.window, {
    type: "info",
    message: "This is the last version of Meru for this Mac.",
    detail: `Meru ${app.getVersion()} is the last version that runs on macOS ${process.getSystemVersion()}. Newer versions need macOS 13 or later, so Meru won't check for updates on this Mac. This version keeps working, but it gets no further fixes, security fixes included, so using it long term is at your own risk.`,
    buttons: ["OK"],
    defaultId: 0,
    cancelId: 0,
    checkboxLabel: "Don't show again",
  });

  if (checkboxChecked) {
    config.set("updates.autoCheck", false);
  }
}

export async function confirmAppLinksTabHandover(
  workspaceApp: SupportedWorkspaceApp,
  appLinksTabTitle: string,
  { isTargetWindowed }: { isTargetWindowed: boolean },
) {
  const appLabel = workspaceApps[workspaceApp].label;

  // The tab taking the links can be living in its own window, and the context
  // menu item that opens this dialog already says so.
  const targetLabel = isTargetWindowed ? "window" : "tab";

  const { response } = await dialog.showMessageBox(main.window, {
    type: "info",
    buttons: ["Open links here", "Cancel"],
    message: `Open ${appLabel} links in this ${targetLabel}?`,
    detail: `“${appLinksTabTitle}” currently opens all ${appLabel} links. This ${targetLabel} will open them instead.`,
    defaultId: 0,
    cancelId: 1,
  });

  return response === 0;
}

export function openProUpgradeUrl() {
  openExternalUrl(`${WEBSITE_URL}/#pricing`, { skipTrustedHostCheck: true });
}

export async function showProUpgradeDialog(message: string) {
  const { response } = await dialog.showMessageBox(main.window, {
    type: "warning",
    buttons: ["Upgrade to Meru Pro", "Cancel"],
    message,
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    openProUpgradeUrl();
  }
}
