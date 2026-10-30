import { select, t } from "@lingui/core/macro";
import { WEBSITE_URL } from "@meru/shared/constants";
import { type SupportedWorkspaceApp, workspaceApps } from "@meru/shared/workspace-apps";
import { app, dialog, type MessageBoxOptions } from "electron";
import { relaunchApp } from "@/lib/relaunch";
import { config } from "./config";
import { main } from "./main";
import { openExternalUrl } from "./url";

/**
 * A native dialog's OK takes the operating system's word, which in some
 * languages differs from the OK that Meru's own pages draw, so the two are
 * separate messages.
 */
export function getNativeOkLabel() {
  return t({
    message: "OK",
    context: "native dialog",
    comment: "The OK button of a native dialog",
  });
}

export async function showRestartDialog() {
  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: [
      t({ message: "Restart", comment: "Dialog button that restarts Meru" }),
      t({ message: "Later", comment: "Dialog button that puts off restarting Meru" }),
    ],
    message: t`Restart Meru to apply the changes.`,
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    relaunchApp();
    app.quit();
  }
}

export async function showUnsupportedMacOSDialog() {
  const version = app.getVersion();

  const macOSVersion = process.getSystemVersion();

  const { checkboxChecked } = await dialog.showMessageBox(main.window, {
    type: "info",
    message: t`This is the last version of Meru for this Mac.`,
    detail: t`Meru ${version} is the last version that runs on macOS ${macOSVersion}. Newer versions need macOS 13 or later, so Meru won't check for updates on this Mac. This version keeps working, but it gets no further fixes, security fixes included, so using it long term is at your own risk.`,
    buttons: [getNativeOkLabel()],
    defaultId: 0,
    cancelId: 0,
    checkboxLabel: t`Don't show again`,
  });

  if (checkboxChecked) {
    config.set("updates.autoCheck", false);
  }
}

/**
 * A dialog given the main window is a sheet inside it, and closing Meru's
 * window hides it rather than quitting, while Check for Updates… stays in the
 * macOS app menu. A sheet on a hidden window is never seen.
 */
function showUpdateMessageBox(options: MessageBoxOptions) {
  if (main.window.isVisible()) {
    dialog.showMessageBox(main.window, options);

    return;
  }

  dialog.showMessageBox(options);
}

export function showUpdateNotAvailableDialog() {
  const version = app.getVersion();

  showUpdateMessageBox({
    type: "info",
    message: t`Meru is up to date.`,
    detail: t`Meru ${version} is the latest version.`,
    buttons: [getNativeOkLabel()],
    defaultId: 0,
    cancelId: 0,
  });
}

export function showUpdateAvailableDialog(version: string) {
  showUpdateMessageBox({
    type: "info",
    message: t`Meru ${version} is available.`,
    detail: t`Meru installs it when you quit.`,
    buttons: [getNativeOkLabel()],
    defaultId: 0,
    cancelId: 0,
  });
}

export function showUpdateCheckFailedDialog() {
  showUpdateMessageBox({
    type: "warning",
    message: t`Meru couldn't check for updates.`,
    detail: t`Try again later.`,
    buttons: [getNativeOkLabel()],
    defaultId: 0,
    cancelId: 0,
  });
}

export async function confirmAppLinksTabHandover(
  workspaceApp: SupportedWorkspaceApp,
  appLinksTabTitle: string,
  { isTargetWindowed }: { isTargetWindowed: boolean },
) {
  const appLabel = workspaceApps[workspaceApp].label;

  // The tab taking the links can be living in its own window, and the context
  // menu item that opens this dialog already says so.
  const target = isTargetWindowed ? "window" : "tab";

  const { response } = await dialog.showMessageBox(main.window, {
    type: "info",
    buttons: [
      t({
        message: "Open links here",
        comment: "Button that makes this tab or window the one that opens the app's links",
      }),
      t`Cancel`,
    ],
    message: t({
      message: select(target, {
        window: `Open ${appLabel} links in this window?`,
        other: `Open ${appLabel} links in this tab?`,
      }),
      comment: "appLabel is the name of a Google Workspace app, such as Docs or Sheets",
    }),
    detail: t({
      message: select(target, {
        window: `“${appLinksTabTitle}” currently opens all ${appLabel} links. This window will open them instead.`,
        other: `“${appLinksTabTitle}” currently opens all ${appLabel} links. This tab will open them instead.`,
      }),
      comment:
        "appLinksTabTitle is the title of the tab that opens the links today; appLabel is the name of a Google Workspace app, such as Docs or Sheets",
    }),
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
    buttons: [t`Upgrade to Meru Pro`, t`Cancel`],
    message,
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    openProUpgradeUrl();
  }
}
