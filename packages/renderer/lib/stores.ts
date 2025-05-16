import { ipcMain, ipcRenderer } from "@meru/renderer-lib/ipc";
import {
	accountsSearchParam,
	accountsUnreadBadgeSearchParam,
} from "@meru/renderer-lib/search-params";
import type { AccountInstances } from "@meru/shared/schemas";
import { create } from "zustand";

export const useAccountsStore = create<{
	accounts: AccountInstances;
	unreadBadge: boolean;
}>(() => {
	if (!accountsSearchParam) {
		throw new Error("No accounts found in search params");
	}

	if (!accountsUnreadBadgeSearchParam) {
		throw new Error("No accounts unread badge found in search params");
	}

	return {
		accounts: JSON.parse(accountsSearchParam),
		unreadBadge: JSON.parse(accountsUnreadBadgeSearchParam),
	};
});

ipcRenderer.on("accountsChanged", (_event, accounts) => {
	useAccountsStore.setState({ accounts });
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
