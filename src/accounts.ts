import { randomUUID } from "node:crypto";
import EventEmitter from "node:events";
import { type AccountConfig, config } from "@/lib/config";
import { platform } from "@electron-toolkit/utils";
import { app } from "electron";
import { Gmail } from "./gmail";
import { main } from "./main";
import { appState } from "./state";
import { appTray } from "./tray";

type AccountsEvents = {
	"accounts-changed": (
		accounts: {
			config: AccountConfig;
			gmail: Gmail;
		}[],
	) => void;
};

class Accounts {
	private _emitter = new EventEmitter();

	gmails: Map<string, Gmail> = new Map();

	init() {
		let accountConfigs = this.getAccountConfigs();

		if (!appState.isValidLicenseKey && accountConfigs.length > 1) {
			accountConfigs[0].selected = true;

			accountConfigs = [accountConfigs[0]];

			config.set("accounts", accountConfigs);
		}

		for (const accountConfig of accountConfigs) {
			const gmail = new Gmail(accountConfig);

			this.setGmailStateListener(gmail);

			this.gmails.set(accountConfig.id, gmail);

			gmail.view.webContents.once("did-finish-load", () => {
				gmail.view.setVisible(accountConfig.selected);
			});
		}

		main.window.contentView.addChildView(this.getSelectedAccount().gmail.view);

		config.onDidChange("accounts", () => {
			this.emit("accounts-changed", this.getAccounts());
		});
	}

	getAccountConfigs() {
		const accountConfigs = config.get("accounts");

		return accountConfigs;
	}

	setGmailStateListener(gmail: Gmail) {
		const dockUnreadBadge = config.get("dock.unreadBadge");

		gmail.on("state-changed", () => {
			const totalUnreadCount = this.getTotalUnreadCount();

			if (platform.isMacOS && app.dock && dockUnreadBadge) {
				app.dock.setBadge(totalUnreadCount ? totalUnreadCount.toString() : "");
			}

			if (platform.isLinux && dockUnreadBadge) {
				app.badgeCount = totalUnreadCount;
			}

			appTray.updateUnreadStatus(totalUnreadCount);

			this.emit("accounts-changed", this.getAccounts());
		});
	}

	getTotalUnreadCount() {
		return Array.from(this.gmails.values()).reduce(
			(totalUnreadCount, account) =>
				totalUnreadCount + account.state.unreadCount,
			0,
		);
	}

	getAccount(accountId: string) {
		const accountConfig = this.getAccountConfigs().find(
			(account) => account.id === accountId,
		);

		if (!accountConfig) {
			throw new Error("Could not find account config");
		}

		const gmail = this.gmails.get(accountId);

		if (!gmail) {
			throw new Error("Could not find account instance");
		}

		return { config: accountConfig, gmail };
	}

	getAccounts() {
		return this.getAccountConfigs().map((accountConfig) => {
			const gmail = this.gmails.get(accountConfig.id);

			if (!gmail) {
				throw new Error("Could not find account instance");
			}

			return { config: accountConfig, gmail };
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

		for (const [accountId, account] of this.gmails) {
			account.view.setVisible(accountId === selectedAccountId);

			if (accountId === selectedAccountId) {
				account.view.webContents.focus();
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

		const gmail = new Gmail(createdAccount);

		this.setGmailStateListener(gmail);

		this.gmails.set(createdAccount.id, gmail);

		config.set("accounts", [...this.getAccountConfigs(), createdAccount]);

		for (const account of this.gmails.values()) {
			account.updateViewBounds();
		}

		this.selectAccount(createdAccount.id);

		appState.setIsSettingsOpen(false);
	}

	removeAccount(selectedAccountId: string) {
		const account = this.getAccount(selectedAccountId);

		account.gmail.destroy();

		this.gmails.delete(selectedAccountId);

		const updatedAccounts = this.getAccountConfigs().filter(
			(account) => account.id !== selectedAccountId,
		);

		if (updatedAccounts.every((account) => account.selected === false)) {
			updatedAccounts[0].selected = true;
		}

		config.set("accounts", updatedAccounts);

		for (const account of this.gmails.values()) {
			account.updateViewBounds();
		}
	}

	updateAccount(accountDetails: Pick<AccountConfig, "id" | "label">) {
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
		for (const account of this.gmails.values()) {
			account.view.setVisible(false);
		}
	}

	show() {
		const selectedAccount = this.getSelectedAccount();

		this.selectAccount(selectedAccount.config.id);
	}

	on<K extends keyof AccountsEvents>(event: K, listener: AccountsEvents[K]) {
		this._emitter.on(event, listener);

		return () => {
			this.off(event, listener);
		};
	}

	off<K extends keyof AccountsEvents>(event: K, listener: AccountsEvents[K]) {
		return this._emitter.off(event, listener);
	}

	emit<K extends keyof AccountsEvents>(
		event: K,
		...args: Parameters<AccountsEvents[K]>
	) {
		return this._emitter.emit(event, ...args);
	}
}

export const accounts = new Accounts();
