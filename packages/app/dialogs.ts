import { WEBSITE_URL } from "@meru/shared/constants";
import { type SupportedWorkspaceApp, workspaceApps } from "@meru/shared/workspace-apps";
import { app, dialog } from "electron";
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
    app.relaunch();
    app.quit();
  }
}

export async function confirmAppLinksTabHandover(
  workspaceApp: SupportedWorkspaceApp,
  appLinksTabTitle: string,
) {
  const appLabel = workspaceApps[workspaceApp].label;

  const { response } = await dialog.showMessageBox(main.window, {
    type: "info",
    buttons: ["Open links here", "Cancel"],
    message: `Open ${appLabel} links in this tab?`,
    detail: `“${appLinksTabTitle}” currently opens all ${appLabel} links. This tab will open them instead.`,
    defaultId: 0,
    cancelId: 1,
  });

  return response === 0;
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
    openExternalUrl(`${WEBSITE_URL}/#pricing`, { skipTrustedHostCheck: true });
  }
}
