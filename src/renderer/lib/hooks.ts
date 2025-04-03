import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ipcMain, ipcRenderer } from "./ipc";

export function useAccounts() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getAccounts"],
		queryFn: () => ipcMain.invoke("getAccounts"),
	});

	useEffect(() => {
		return ipcRenderer.on("onAccountsChanged", (_event, accounts) => {
			queryClient.setQueryData(["getAccounts"], accounts);
		});
	}, [queryClient]);

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
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getIsSettingsOpen"],
		queryFn: () => ipcMain.invoke("getIsSettingsOpen"),
	});

	useEffect(() => {
		return ipcRenderer.on(
			"onIsSettingsOpenChanged",
			(_event, isSettingsOpen) => {
				queryClient.setQueryData(["getIsSettingsOpen"], isSettingsOpen);
			},
		);
	}, [queryClient]);

	return query;
}
