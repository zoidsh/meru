import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ipcMain } from "./ipc";

export function useAccounts() {
	const query = useQuery({
		queryKey: ["accounts"],
		queryFn: () => ipcMain.invoke("getAccounts"),
	});

	return query;
}

export function useSelectedAccount() {
	const accounts = useAccounts();

	const selectedAccount = accounts.data?.find(
		(account) => account.config.selected,
	);

	return selectedAccount;
}

export function useIsSettingsOpen() {
	const query = useQuery({
		queryKey: ["isSettingsOpen"],
		queryFn: () => ipcMain.invoke("getIsSettingsOpen"),
	});

	return query;
}
