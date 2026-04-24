import { ipc } from "@meru/shared/renderer/ipc";
import { accountsSearchParam, trialDaysLeftSearchParam } from "@meru/shared/renderer/search-params";
import type { AccountInstances } from "@meru/shared/schemas";
import { toast } from "sonner";
import { create } from "zustand";
import { getConfig } from "@meru/shared/renderer/react-query";
import { navigate } from "wouter/use-hash-location";

export const useAccountsStore = create<{
  accounts: AccountInstances;
  isAddAccountDialogOpen: boolean;
  setIsAddAccountDialogOpen: (isOpen: boolean) => void;
}>((set) => {
  if (!accountsSearchParam) {
    throw new Error("No accounts found in search params");
  }

  return {
    accounts: JSON.parse(accountsSearchParam),
    isAddAccountDialogOpen: false,
    setIsAddAccountDialogOpen: (isOpen) => {
      set({ isAddAccountDialogOpen: isOpen });
    },
  };
});

ipc.renderer.on("accounts.changed", (_event, accounts) => {
  useAccountsStore.setState({ accounts });
});

ipc.renderer.on("accounts.openAddAccountDialog", async (_event) => {
  const config = await getConfig();

  if (!config.licenseKey && !useTrialStore.getState().daysLeft) {
    toast.error("Meru Pro required", {
      description: "Please upgrade to Meru Pro to add more accounts.",
    });

    return;
  }

  useAccountsStore.setState({ isAddAccountDialogOpen: true });
});

export const useSettingsStore = create<{
  isOpen: boolean;
}>(() => ({
  isOpen: false,
}));

ipc.renderer.on("settings.setIsOpen", (_event, isOpen) => {
  useSettingsStore.setState({ isOpen });

  if (!isOpen) {
    navigate("/");
  }
});

export const useFindInPageStore = create<{
  isActive: boolean;
  deactivate: () => void;
  activeMatch: number;
  totalMatches: number;
}>((set) => ({
  isActive: false,
  deactivate: () => {
    ipc.main.send("findInPage", null);

    set({ isActive: false });
  },
  activeMatch: 0,
  totalMatches: 0,
}));

ipc.renderer.on("findInPage.activate", () => {
  useFindInPageStore.setState(() => ({
    isActive: true,
  }));
});

ipc.renderer.on("findInPage.result", (_event, { activeMatch, totalMatches }) => {
  useFindInPageStore.setState(() => ({
    activeMatch,
    totalMatches,
  }));
});

export const useTrialStore = create<{
  daysLeft: number;
}>(() => {
  const daysLeft = Number(trialDaysLeftSearchParam);

  return {
    daysLeft,
  };
});

ipc.renderer.on("trial.daysLeftChanged", (_event, daysLeft) => {
  useTrialStore.setState({ daysLeft });
});

export const useDownloadsStore = create<{
  hasUnviewedCompletedDownload: boolean;
}>(() => ({
  hasUnviewedCompletedDownload: false,
}));

ipc.renderer.on("downloads.itemCompleted", () => {
  useDownloadsStore.setState({
    hasUnviewedCompletedDownload: true,
  });
});

export const useAppUpdaterStore = create<{
  version: string | null;
  dismiss: () => void;
}>((set) => ({
  version: null,
  dismiss: () => {
    set({ version: null });
  },
}));

ipc.renderer.on("appUpdater.updateAvailable", (_event, version) => {
  useAppUpdaterStore.setState({ version });
});
