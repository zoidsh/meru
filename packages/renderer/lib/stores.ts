import type { AccountInstances } from "@meru/shared/schemas";
import { create } from "zustand";
import { ipcRenderer } from "./ipc";
import {
	accountsSearchParam,
	accountsUnreadBadgeSearchParam,
} from "./search-params";

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
