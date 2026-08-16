import type { GmailInboxMessage } from "@meru/shared/gmail";
import { ms } from "@meru/shared/ms";
import { ipc } from "@meru/shared/renderer/ipc";
import type { AccountConfig } from "@meru/shared/schemas";
import { getVerticalTabsWidth, getVisibleVerticalTabs } from "@meru/shared/tabs";
import { useEffect, useRef, useState } from "react";
import { useConfig } from "./react-query";
import { useAccountsStore, useTabsStore, useTrialStore } from "./stores";

export function useMouseAccountSwitching() {
  useEffect(() => {
    const handleMouseBackAndForward = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) {
        ipc.main.send(
          event.button === 3 ? "accounts.selectPreviousAccount" : "accounts.selectNextAccount",
        );
      }
    };

    document.addEventListener("mousedown", handleMouseBackAndForward);

    return () => {
      document.removeEventListener("mousedown", handleMouseBackAndForward);
    };
  }, []);
}

export function useCloseOnWindowBlur(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleWindowBlur = () => {
      onClose();
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isOpen, onClose]);
}

/** Every tab of the selected account, before the vertical tabs strip narrows them down. */
export function useSelectedAccountTabs() {
  const accounts = useAccountsStore((state) => state.accounts);

  const accountsTabs = useTabsStore((state) => state.accountsTabs);

  const selectedAccount = accounts.find((account) => account.config.selected);

  const tabs =
    accountsTabs.find((accountTabs) => accountTabs.accountId === selectedAccount?.config.id)
      ?.tabs ?? [];

  return { selectedAccount, tabs };
}

/**
 * What the vertical tabs strip renders and the width it takes up. The titlebar
 * reads it too, to know whether the strip is there to host the Workspace Apps
 * launcher.
 */
export function useVerticalTabs() {
  const { selectedAccount, tabs: selectedAccountTabs } = useSelectedAccountTabs();

  const { config } = useConfig();

  const tabs = getVisibleVerticalTabs(selectedAccountTabs, {
    workspaceAppsMode: config?.["workspaceApps.mode"] ?? "tabs",
    showWindows: config?.["verticalTabs.showWindows"] ?? true,
  });

  const width = getVerticalTabsWidth(tabs, {
    configuredWidth: config?.["verticalTabs.width"] ?? "auto",
    sessionWidth: selectedAccount?.verticalTabsWidth ?? null,
    launcherAndBookmarksPlacement:
      config?.["workspaceApps.launcherAndBookmarksPlacement"] ?? "auto",
  });

  return { selectedAccount, tabs, width };
}

export function useIsLicenseKeyValid() {
  const { config } = useConfig();

  const isTrialActive = useTrialStore((state) => Boolean(state.daysLeft));

  return isTrialActive || Boolean(config?.licenseKey);
}

export type UnifiedInboxMessage = GmailInboxMessage & {
  account: Pick<AccountConfig, "id" | "label" | "color">;
};

export function useUnifiedInbox() {
  const accounts = useAccountsStore((state) => state.accounts);

  const messages: UnifiedInboxMessage[] = accounts
    .map((account) =>
      account.gmail.unreadInbox.map((mail) => ({
        account: {
          id: account.config.id,
          label: account.config.label,
          color: account.config.color,
        },
        ...mail,
      })),
    )
    .flat()
    .sort((a, b) => (b.receivedAt > a.receivedAt ? 1 : -1));

  return { messages };
}

export function useCopied() {
  const [copied, setCopied] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const markCopied = () => {
    setCopied(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, ms("2s"));
  };

  return { copied, markCopied };
}
