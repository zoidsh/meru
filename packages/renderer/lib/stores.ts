import { ipc } from "@meru/renderer-lib/ipc";
import {
	accountsSearchParam,
	accountsUnreadBadgeSearchParam,
	darkModeSearchParam,
	licenseKeySearchParam,
	trialDaysLeftSearchParam,
} from "@meru/renderer-lib/search-params";
import type { AccountInstances } from "@meru/shared/schemas";
import type { DownloadItem } from "@meru/shared/types";
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

ipc.renderer.on("accounts.changed", (_event, accounts) => {
	useAccountsStore.setState({ accounts });
});

ipc.renderer.on("accounts.openAddAccountDialog", (_event) => {
	if (!licenseKeySearchParam && !useTrialStore.getState().daysLeft) {
		toast.error("Meru Pro required", {
			description: "Please upgrade to Meru Pro to add more accounts.",
		});

		return;
	}

	useAccountsStore.setState({ isAddAccountDialogOpen: true });
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

ipc.renderer.on(
	"findInPage.result",
	(_event, { activeMatch, totalMatches }) => {
		useFindInPageStore.setState(() => ({
			activeMatch,
			totalMatches,
		}));
	},
);

export const useThemeStore = create<{
	theme: "light" | "dark";
}>(() => ({
	theme: darkModeSearchParam === "true" ? "dark" : "light",
}));

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
	history: DownloadItem[];
	itemCompleted: string | null;
}>(() => ({
	history: [],
	itemCompleted: null,
}));

ipc.main.invoke("downloads.getHistory").then((downloadHistory) => {
	useDownloadsStore.setState(() => ({
		history: downloadHistory,
	}));
});

ipc.renderer.on("downloads.historyChanged", (_event, downloadHistory) => {
	useDownloadsStore.setState(() => ({
		history: downloadHistory,
	}));
});

ipc.renderer.on("downloads.itemCompleted", (_event, itemId) => {
	useDownloadsStore.setState(() => ({
		itemCompleted: itemId,
	}));
});
