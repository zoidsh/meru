import { randomUUID } from "node:crypto";
import type { AccountConfig } from "@meru/shared/schemas";
import { Account } from "./account";
import { config } from "./config";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { appState } from "./state";

class Accounts {
	instances: Map<string, Account> = new Map();

	init() {
		let accountConfigs = config.get("accounts");

		if (!licenseKey.isValid && accountConfigs.length > 1) {
			if (!accountConfigs[0]) {
				throw new Error("Could not find first account");
			}

			accountConfigs[0].selected = true;

			accountConfigs = [accountConfigs[0]];

			config.set("accounts", accountConfigs);
		}

		for (const accountConfig of accountConfigs) {
			const account = new Account(accountConfig);

			this.instances.set(accountConfig.id, account);
		}
	}

	async createViews() {
		const accounts = this.getAccounts().sort((a, b) => {
			if (a.config.selected && !b.config.selected) {
				return 1;
			}

			if (!a.config.selected && b.config.selected) {
				return -1;
			}

			return 0;
		});

		await Promise.all(
			accounts.map((account) =>
				account.instance.gmail.createView({
					webPreferences: {
						backgroundThrottling: false,
					},
				}),
			),
		);

		for (const account of accounts) {
			account.instance.gmail.view.webContents.setBackgroundThrottling(true);
		}
	}

	getAccountConfigs() {
		const accountConfigs = config.get("accounts");

		return accountConfigs;
	}

	getAccount(accountId: string) {
		const accountConfig = this.getAccountConfigs().find(
			(account) => account.id === accountId,
		);

		if (!accountConfig) {
			throw new Error("Could not find account config");
		}

		const instance = this.instances.get(accountId);

		if (!instance) {
			throw new Error("Could not find account instance");
		}

		return {
			config: accountConfig,
			instance,
		};
	}

	getAccounts() {
		return this.getAccountConfigs().map((accountConfig) => {
			const instance = this.instances.get(accountConfig.id);

			if (!instance) {
				throw new Error("Could not find account instance");
			}

			return {
				config: accountConfig,
				instance,
			};
		});
	}

	getSelectedAccount() {
		let selectedAccount: ReturnType<typeof this.getAccount> | undefined;

		for (const accountConfig of this.getAccountConfigs()) {
			if (accountConfig.selected) {
				selectedAccount = this.getAccount(accountConfig.id);

				break;
			}
		}

		if (!selectedAccount) {
			throw new Error("Could not find selected account");
		}

		return selectedAccount;
	}

	selectAccount(selectedAccountId: string) {
		config.set(
			"accounts",
			this.getAccountConfigs().map((accountConfig) => {
				return {
					...accountConfig,
					selected: accountConfig.id === selectedAccountId,
				};
			}),
		);

		for (const [accountId, account] of this.instances) {
			if (accountId === selectedAccountId) {
				main.window.contentView.addChildView(account.gmail.view);
				account.gmail.view.webContents.focus();
			}
		}
	}

	selectPreviousAccount() {
		const accountConfigs = this.getAccountConfigs();

		const selectedAccountIndex = accountConfigs.findIndex(
			(accountConfig) => accountConfig.selected,
		);

		const previousAccount = accountConfigs.at(
			selectedAccountIndex === 0 ? -1 : selectedAccountIndex - 1,
		);

		if (!previousAccount) {
			throw new Error("Could not find previous account");
		}

		this.selectAccount(previousAccount.id);
	}

	selectNextAccount() {
		const accountConfigs = this.getAccountConfigs();

		const selectedAccountIndex = accountConfigs.findIndex(
			(accountConfig) => accountConfig.selected,
		);

		const nextAccount = accountConfigs.at(
			selectedAccountIndex === accountConfigs.length - 1
				? 0
				: selectedAccountIndex + 1,
		);

		if (!nextAccount) {
			throw new Error("Could not find next account");
		}

		this.selectAccount(nextAccount.id);
	}

	addAccount(
		accountDetails: Pick<
			AccountConfig,
			"label" | "unreadBadge" | "notifications"
		>,
	) {
		const createdAccount: AccountConfig = {
			id: randomUUID(),
			selected: false,
			...accountDetails,
		};

		const instance = new Account(createdAccount);

		instance.gmail.createView();

		this.instances.set(createdAccount.id, instance);

		config.set("accounts", [...this.getAccountConfigs(), createdAccount]);

		this.selectAccount(createdAccount.id);

		this.show();

		appState.setIsSettingsOpen(false);
	}

	removeAccount(selectedAccountId: string) {
		const account = this.getAccount(selectedAccountId);

		account.instance.gmail.destroy();

		this.instances.delete(selectedAccountId);

		const updatedAccounts = this.getAccountConfigs().filter(
			(account) => account.id !== selectedAccountId,
		);

		if (updatedAccounts.every((account) => account.selected === false)) {
			if (!updatedAccounts[0]) {
				throw new Error("Could not find first account");
			}

			updatedAccounts[0].selected = true;
		}

		config.set("accounts", updatedAccounts);

		for (const account of this.instances.values()) {
			account.gmail.updateViewBounds();
		}
	}

	updateAccount(accountDetails: AccountConfig) {
		config.set(
			"accounts",
			this.getAccountConfigs().map((account) =>
				account.id === accountDetails.id
					? { ...account, ...accountDetails }
					: account,
			),
		);
	}

	moveAccount(selectedAccountId: string, direction: "up" | "down") {
		const accountConfigs = this.getAccountConfigs();

		const selectedAccountConfigIndex = accountConfigs.findIndex(
			(account) => account.id === selectedAccountId,
		);

		const selectedAccountConfig = accountConfigs.splice(
			selectedAccountConfigIndex,
			1,
		)[0];

		if (!selectedAccountConfig) {
			throw new Error("Could not find selected account config");
		}

		accountConfigs.splice(
			direction === "up"
				? selectedAccountConfigIndex - 1
				: direction === "down"
					? selectedAccountConfigIndex + 1
					: selectedAccountConfigIndex,
			0,
			selectedAccountConfig,
		);

		config.set("accounts", accountConfigs);
	}

	hide() {
		for (const account of this.instances.values()) {
			account.gmail.view.setVisible(false);
		}
	}

	show() {
		for (const account of this.instances.values()) {
			account.gmail.view.setVisible(true);
		}
	}

	getTotalUnreadCount() {
		return Array.from(accounts.instances.values()).reduce(
			(totalUnreadCount, instance) => {
				const unreadCount = instance.gmail.store.getState().unreadCount;

				return typeof unreadCount === "number"
					? totalUnreadCount + unreadCount
					: totalUnreadCount;
			},
			0,
		);
	}
}

export const accounts = new Accounts();
