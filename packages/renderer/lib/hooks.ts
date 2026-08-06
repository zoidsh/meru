import type { GmailInboxMessage } from "@meru/shared/gmail";
import { ipc } from "@meru/shared/renderer/ipc";
import { useConfig } from "@meru/shared/renderer/react-query";
import type { AccountConfig } from "@meru/shared/schemas";
import { type Dispatch, type SetStateAction, useEffect } from "react";
import { useAccountsStore, useTrialStore } from "./stores";

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

export function useCloseMenuOnWindowBlur(
  isMenuOpen: boolean,
  setIsMenuOpen: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleWindowBlur = () => {
      setIsMenuOpen(false);
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isMenuOpen, setIsMenuOpen]);
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
