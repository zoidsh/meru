import type { Gmail } from "@/gmail";
import { app } from "electron";
import { config } from "./config";

export function getAccounts() {
	return config.get("accounts");
}

export function getSelectedAccount() {
	const accounts = getAccounts();

	const selectedAccount = accounts.find((account) => account.selected);

	if (!selectedAccount) {
		accounts[0].selected = true;

		config.set("accounts", accounts);

		app.relaunch();
		app.quit();

		throw new Error("Could not find selected account");
	}

	return selectedAccount;
}

export function selectAccount(selectedAccountId: string, gmail: Gmail) {
	config.set(
		"accounts",
		getAccounts().map((account) => {
			if (account.id === selectedAccountId) {
				gmail.selectView(account);
			}

			return { ...account, selected: account.id === selectedAccountId };
		}),
	);
}

export function selectPreviousAccount(gmail: Gmail) {
	const accounts = getAccounts();

	const selectedAccountIndex = accounts.findIndex(
		(account) => account.selected,
	);

	const previousAccount = accounts.at(
		selectedAccountIndex === 0 ? -1 : selectedAccountIndex + 1,
	);

	if (!previousAccount) {
		throw new Error("Could not find previous account");
	}

	config.set(
		"accounts",
		accounts.map((account) => ({
			...account,
			selected: account.id === previousAccount.id,
		})),
	);

	gmail.selectView(previousAccount);

	return previousAccount;
}

export function selectNextAccount(gmail: Gmail) {
	const accounts = getAccounts();

	const selectedAccountIndex = accounts.findIndex(
		(account) => account.selected,
	);

	const nextAccount = accounts.at(
		selectedAccountIndex === accounts.length - 1 ? 0 : selectedAccountIndex - 1,
	);

	if (!nextAccount) {
		throw new Error("Could not find next account");
	}

	config.set(
		"accounts",
		accounts.map((account) => ({
			...account,
			selected: account.id === nextAccount.id,
		})),
	);

	gmail.selectView(nextAccount);

	return nextAccount;
}
