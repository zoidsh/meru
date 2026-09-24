import { ipc } from "@meru/shared/renderer/ipc";
import type { AccountInstances } from "@meru/shared/schemas";
import type { AccountTabsState } from "@meru/shared/tabs";
import { create } from "zustand";

export const useAccountsStore = create<{
  accounts: AccountInstances;
  isLoaded: boolean;
  isAddAccountDialogOpen: boolean;
  setIsAddAccountDialogOpen: (isOpen: boolean) => void;
}>((set) => ({
  accounts: [],
  isLoaded: false,
  isAddAccountDialogOpen: false,
  setIsAddAccountDialogOpen: (isOpen) => {
    set({ isAddAccountDialogOpen: isOpen });
  },
}));

ipc.renderer.on("accounts.changed", (_event, accounts) => {
  useAccountsStore.setState({ accounts, isLoaded: true });
});

export const useTabsStore = create<{
  accountsTabs: AccountTabsState[];
}>(() => ({
  accountsTabs: [],
}));

ipc.renderer.on("tabs.changed", (_event, accountsTabs) => {
  useTabsStore.setState({ accountsTabs });
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
}>(() => ({
  daysLeft: 0,
}));

let isTrialDaysLeftPushed = false;

ipc.renderer.on("trial.daysLeftChanged", (_event, daysLeft) => {
  isTrialDaysLeftPushed = true;

  useTrialStore.setState({ daysLeft });
});

/**
 * Only the main window is handed the accounts and the trial, so the pages that
 * import this module for another store do not ask for them.
 *
 * A push that lands while a seed is in flight carries the newer state, so the
 * seed that loses the race is dropped rather than applied on top of it.
 */
export function seedMainWindowStores() {
  ipc.main.invoke("accounts.getAccounts").then((accounts) => {
    if (useAccountsStore.getState().isLoaded) {
      return;
    }

    useAccountsStore.setState({ accounts, isLoaded: true });
  });

  ipc.main.invoke("trial.getDaysLeft").then((daysLeft) => {
    if (isTrialDaysLeftPushed) {
      return;
    }

    useTrialStore.setState({ daysLeft });
  });
}

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
