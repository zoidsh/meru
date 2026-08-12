import { type SupportedWorkspaceApp, workspaceApps } from "@meru/shared/workspace-apps";
import { app, dialog } from "electron";
import { main } from "./main";

export async function showRestartDialog() {
  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: ["Restart", "Later"],
    message: "Restart required to apply changes",
    detail: "Do you want to restart the app now?",
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
    buttons: ["Open Links Here", "Cancel"],
    message: `Open ${appLabel} links in this tab?`,
    detail: `“${appLinksTabTitle}” opens all ${appLabel} links right now. It will stop doing so.`,
    defaultId: 0,
    cancelId: 1,
  });

  return response === 0;
}
