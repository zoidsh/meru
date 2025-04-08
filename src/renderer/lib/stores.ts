import type { Accounts } from "@/ipc";
import { create } from "zustand";

export const useAccountsStore = create<{
	accounts: Accounts;
}>(() => ({
	accounts: [],
}));

export const useSettingsStore = create<{
	isOpen: boolean;
}>(() => ({
	isOpen: false,
}));
