import { getWorkspaceAppUrl } from "@meru/shared/google";
import type { SupportedWorkspaceApp, WorkspaceAppOpenBehavior } from "@meru/shared/workspace-apps";
import { accounts } from "@/accounts";
import { licenseKey } from "@/license-key";
import { openExternalUrl } from "@/url";
import { canOpenWorkspaceAppInApp, resolveWorkspaceAppOpenBehavior } from "@/workspace-app";

/**
 * Opens a workspace app the way the launcher does, wherever the request comes
 * from: the launcher itself, or the application menu.
 */
export function openWorkspaceApp(
  app: SupportedWorkspaceApp,
  modifierOpenBehavior?: WorkspaceAppOpenBehavior,
) {
  if (!licenseKey.isValid) {
    return;
  }

  if (!canOpenWorkspaceAppInApp(app)) {
    openExternalUrl(getWorkspaceAppUrl(app), {
      skipTrustedHostCheck: true,
      focusBrowser: modifierOpenBehavior !== "backgroundTab",
    });

    return;
  }

  const openBehavior = resolveWorkspaceAppOpenBehavior(modifierOpenBehavior);

  const selectedAccount = accounts.getSelectedAccount();

  if (openBehavior === "newWindow") {
    selectedAccount.instance.tabs.openWindowedTab(getWorkspaceAppUrl(app));

    return;
  }

  const workspaceApp = selectedAccount.instance.tabs.openTab(getWorkspaceAppUrl(app));

  if (openBehavior === "backgroundTab") {
    return;
  }

  selectedAccount.instance.tabs.activateTab(workspaceApp.id);

  accounts.refreshSelectedAccountView();
}
