import { ipcMain, ipcRenderer } from "@meru/renderer-lib/ipc";
import {
	accountsSearchParam,
	accountsUnreadBadgeSearchParam,
	darkModeSearchParam,
	licenseKeySearchParam,
	trialDaysLeftSearchParam,
} from "@meru/renderer-lib/search-params";
import type { AccountInstances } from "@meru/shared/schemas";
import { toast } from "sonner";
import { create } from "zustand";

export const useAccountsStore = create<{
	accounts: AccountInstances;
	unreadBadge: boolean;
	isAddAccountDialogOpen: boolean;
	setIsAddAccountDialogOpen: (isOpen: boolean) => void;
}>((set) => {
	if (!accountsSearchParam) {
		throw new Error("No accounts found in search params");
	}

	if (!accountsUnreadBadgeSearchParam) {
		throw new Error("No accounts unread badge found in search params");
	}

	return {
		accounts: JSON.parse(accountsSearchParam),
		unreadBadge: JSON.parse(accountsUnreadBadgeSearchParam),
		isAddAccountDialogOpen: false,
		setIsAddAccountDialogOpen: (isOpen) => {
			set({ isAddAccountDialogOpen: isOpen });
		},
	};
});

ipcRenderer.on("accountsChanged", (_event, accounts) => {
	useAccountsStore.setState({ accounts });
});

ipcRenderer.on("accounts.setIsAddAccountDialogOpen", (_event, isOpen) => {
	if (licenseKeySearchParam) {
		useAccountsStore.setState({ isAddAccountDialogOpen: isOpen });
	} else {
		toast.error("Meru Pro required", {
			description: "Please upgrade to Meru Pro to add more accounts.",
		});
	}
});

export const useSettingsStore = create<{
	isOpen: boolean;
}>(() => ({
	isOpen: false,
}));

ipcRenderer.on("isSettingsOpenChanged", (_event, isSettingsOpen) => {
	useSettingsStore.setState({ isOpen: isSettingsOpen });
});

export const useFindInPageStore = create<{
	isActive: boolean;
	deactivate: () => void;
	activeMatch: number;
	totalMatches: number;
}>((set) => ({
	isActive: false,
	deactivate: () => {
		ipcMain.send("findInPage", null);

		set({ isActive: false });
	},
	activeMatch: 0,
	totalMatches: 0,
}));

ipcRenderer.on("findInPage.activate", () => {
	useFindInPageStore.setState(() => ({
		isActive: true,
	}));
});

ipcRenderer.on("findInPage.result", (_event, { activeMatch, totalMatches }) => {
	useFindInPageStore.setState(() => ({
		activeMatch,
		totalMatches,
	}));
});

export const useThemeStore = create<{
	theme: "light" | "dark";
}>(() => ({
	theme: darkModeSearchParam === "true" ? "dark" : "light",
}));

export const useTrialStore = create<{
	daysLeft: number;
}>(() => ({
	daysLeft: Number(trialDaysLeftSearchParam),
}));

ipcRenderer.on("trial.daysLeftChanged", (_event, daysLeft) => {
	useTrialStore.setState({ daysLeft });
});
