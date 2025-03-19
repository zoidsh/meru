import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { emitter, ipc } from "./ipc";

export function useTitle() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getTitle"],
		queryFn: () => emitter.invoke("getTitle"),
	});

	useEffect(() => {
		ipc.on("onTitleChanged", (_event, title) => {
			queryClient.setQueryData(["getTitle"], title);
		});
	}, [queryClient]);

	return query;
}

export function useAccounts() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getAccounts"],
		queryFn: () => emitter.invoke("getAccounts"),
	});

	useEffect(() => {
		ipc.on("onAccountsChanged", (_event, title) => {
			queryClient.setQueryData(["getAccounts"], title);
		});
	}, [queryClient]);

	return query;
}

export function useGmailVisible() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getGmailVisible"],
		queryFn: () => emitter.invoke("getGmailVisible"),
	});

	useEffect(() => {
		ipc.on("onGmailVisibleChanged", (_event, visible) => {
			queryClient.setQueryData(["getGmailVisible"], visible);
		});
	}, [queryClient]);

	return query;
}

export function useGmailNavigationHistory() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getNavigationHistory"],
		queryFn: () => emitter.invoke("getNavigationHistory"),
	});

	useEffect(() => {
		ipc.on("onNavigationHistoryChanged", (_event, navigationHistory) => {
			queryClient.setQueryData(["getNavigationHistory"], navigationHistory);
		});
	}, [queryClient]);

	return query;
}

export function useIsWindowMaximized() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["getWindowMaximized"],
		queryFn: () => emitter.invoke("getWindowMaximized"),
	});

	useEffect(() => {
		ipc.on("onNavigationHistoryChanged", (_event, navigationHistory) => {
			queryClient.setQueryData(["getWindowMaximized"], navigationHistory);
		});
	}, [queryClient]);

	return query;
}
