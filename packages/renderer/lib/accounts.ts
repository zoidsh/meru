import { ipc } from "@meru/renderer-lib/ipc";
import type { AccountState } from "@meru/shared/accounts";
import type { AccountConfig } from "@meru/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { merge } from "es-toolkit/object";
import type { MergeDeep } from "type-fest";
import { create } from "zustand";
import { configQueryOptions, queryClient } from "./react-query";

ipc.renderer.on(
	"accounts.updateState",
	(_event, accountId, updatedAccountState) => {
		useAccountsStore.setState((state) => {
			const currentAccountState = state.accounts[accountId];

			if (!currentAccountState) {
				throw new Error(
					`Received accounts.updateState for accountId ${accountId} which does not exist in the store.`,
				);
			}

			return {
				accounts: {
					...state.accounts,
					[accountId]: merge(currentAccountState, updatedAccountState),
				},
			};
		});
	},
);

export const useAccountsStore = create<{
	accounts: {
		[id: string]: AccountState;
	};
	initAccounts: () => Promise<void>;
}>((set) => ({
	accounts: {},
	initAccounts: async () => {
		const config = await queryClient.fetchQuery(configQueryOptions);

		for (const account of config.accounts) {
			set((state) => ({
				accounts: {
					...state.accounts,
					[account.id]: {
						gmail: {
							unreadCount: 0,
							outOfOffice: false,
							navigationHistory: {
								canGoBack: false,
								canGoForward: false,
							},
							attentionRequired: false,
						},
					},
				},
			}));
		}
	},
}));

export function useAccounts() {
	const accountStates = useAccountsStore();

	const accountConfigs = useQuery({
		...configQueryOptions,
		select: (config) => config.accounts,
	});

	return (
		accountConfigs.data?.map((accountConfig) => {
			const accountState = accountStates.accounts[accountConfig.id];

			if (!accountState) {
				throw new Error(
					`Account state for accountId ${accountConfig.id} not found in store.`,
				);
			}

			const account: MergeDeep<AccountConfig, AccountState> = merge(
				accountConfig,
				accountState,
			);

			return account;
		}) || []
	);
}
