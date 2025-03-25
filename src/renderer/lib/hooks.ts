import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ipcMain, ipcRenderer } from "./ipc";

export function useTitle() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getTitle"],
		queryFn: () => ipcMain.invoke("getTitle"),
	});

	useEffect(() => {
		return ipcRenderer.on("onTitleChanged", (_event, title) => {
			queryClient.setQueryData(["getTitle"], title);
		});
	}, [queryClient]);

	return query;
}

export function useAccounts() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getAccounts"],
		queryFn: () => ipcMain.invoke("getAccounts"),
	});

	useEffect(() => {
		return ipcRenderer.on("onAccountsChanged", (_event, title) => {
			queryClient.setQueryData(["getAccounts"], title);
		});
	}, [queryClient]);

	return query;
}

export function useGmailVisible() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getGmailVisible"],
		queryFn: () => ipcMain.invoke("getGmailVisible"),
	});

	useEffect(() => {
		return ipcRenderer.on("onGmailVisibleChanged", (_event, visible) => {
			queryClient.setQueryData(["getGmailVisible"], visible);
		});
	}, [queryClient]);

	return query;
}

export function useGmailNavigationHistory() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getNavigationHistory"],
		queryFn: () => ipcMain.invoke("getNavigationHistory"),
	});

	useEffect(() => {
		return ipcRenderer.on(
			"onNavigationHistoryChanged",
			(_event, navigationHistory) => {
				queryClient.setQueryData(["getNavigationHistory"], navigationHistory);
			},
		);
	}, [queryClient]);

	return query;
}

export function useIsWindowMaximized() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getWindowMaximized"],
		queryFn: () => ipcMain.invoke("getWindowMaximized"),
	});

	useEffect(() => {
		return ipcRenderer.on(
			"onNavigationHistoryChanged",
			(_event, navigationHistory) => {
				queryClient.setQueryData(["getWindowMaximized"], navigationHistory);
			},
		);
	}, [queryClient]);

	return query;
}

export function useUnreadMails() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getUnreadMails"],
		queryFn: () => ipcMain.invoke("getUnreadMails"),
	});

	useEffect(() => {
		return ipcRenderer.on("onUnreadMailsChanged", (_event, unreadInboxes) => {
			queryClient.setQueryData(["getUnreadMails"], unreadInboxes);
		});
	}, [queryClient]);

	return query;
}

export function useAccountsAttentionRequired() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getAccountsAttentionRequired"],
		queryFn: () => ipcMain.invoke("getAccountsAttentionRequired"),
	});

	useEffect(() => {
		return ipcRenderer.on(
			"onAccountsAttentionRequiredChanged",
			(_event, unreadInboxes) => {
				queryClient.setQueryData(
					["getAccountsAttentionRequired"],
					unreadInboxes,
				);
			},
		);
	}, [queryClient]);

	return query;
}
