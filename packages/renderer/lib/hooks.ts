import { ipc } from "@meru/renderer-lib/ipc";
import { useEffect, useState } from "react";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
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

export function useIsLicenseKeyValid() {
  const { config } = useConfig();

  const isTrialActive = useTrialStore((state) => Boolean(state.daysLeft));

  return isTrialActive || Boolean(config?.licenseKey);
}

export function useUnifiedInbox() {
  const [page, setPage] = useState(1);

  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const accounts = useAccountsStore((state) => state.accounts);

  const goToFirstPage = () => setPage(1);

  const goToLastPage = () => setPage((prev) => prev + 1);

  const previousPage = () => setPage((prev) => Math.max(prev - 1, 1));

  const nextPage = () => setPage((prev) => prev + 1);

  const setRowsPerPage = (rowsPerPage: number) => {
    configMutation.mutate({ "unifiedInbox.rowsPerPage": rowsPerPage });
  };

  if (!config) {
    return {
      rowsPerPage: 0,
      setRowsPerPage,
      goToFirstPage,
      previousPage,
      nextPage,
      goToLastPage,
      messages: [],
    };
  }

  const messages = accounts
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
    .sort((a, b) => (b.receivedAt > a.receivedAt ? 1 : -1))
    .slice(
      (page - 1) * config["unifiedInbox.rowsPerPage"],
      page * config["unifiedInbox.rowsPerPage"],
    );

  return {
    rowsPerPage: config["unifiedInbox.rowsPerPage"],
    setRowsPerPage,
    page,
    goToFirstPage,
    previousPage,
    nextPage,
    goToLastPage,
    messages,
  };
}
