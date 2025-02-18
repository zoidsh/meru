import { trpc } from "./trpc";

export function useAppTitle() {
	const appTitle = trpc.getTitle.useQuery();

	const utils = trpc.useUtils();

	trpc.onTitleChanged.useSubscription(undefined, {
		onData: (updatedTitle) => {
			utils.getTitle.setData(undefined, updatedTitle);
		},
	});

	return appTitle;
}

export function useAccounts() {
	const accounts = trpc.getAccounts.useQuery(undefined, {
		initialData: [],
	});

	const utils = trpc.useUtils();

	trpc.onAccountsUpdated.useSubscription(undefined, {
		onData: (updatedAccounts) => {
			utils.getAccounts.setData(undefined, updatedAccounts);
		},
	});

	return accounts;
}

export function useSelectAccount() {
	return trpc.selectAccount.useMutation();
}

export function useAddAccount() {
	return trpc.addAccount.useMutation();
}

export function useEditAccount() {
	return trpc.editAccount.useMutation();
}

export function useRemoveAccount() {
	return trpc.removeAccount.useMutation();
}

export function useMoveAccount() {
	return trpc.moveAccount.useMutation();
}

export function useGmailVisible() {
	const gmailVisible = trpc.gmail.getVisible.useQuery(undefined, {
		initialData: true,
	});

	const utils = trpc.useUtils();

	trpc.gmail.onVisibleChanged.useSubscription(undefined, {
		onData: (updatedVisible) => {
			utils.gmail.getVisible.setData(undefined, updatedVisible);
		},
	});

	return gmailVisible;
}
export function useGmailNavigationHistory() {
	const gmailNavigationHistory = trpc.gmail.getNavigationHistory.useQuery();

	const utils = trpc.useUtils();

	trpc.gmail.onNavigationHistoryChanged.useSubscription(undefined, {
		onData: (updatedNavigationHistory) => {
			utils.gmail.getNavigationHistory.setData(
				undefined,
				updatedNavigationHistory,
			);
		},
	});

	return gmailNavigationHistory;
}

export function useGmailNavigationHistoryGo() {
	return trpc.gmail.navigationHistoryGo.useMutation();
}

export function useGmailReload() {
	return trpc.gmail.reload.useMutation();
}

export function useGmailToggleVisible() {
	return trpc.gmail.toggleVisible.useMutation();
}
