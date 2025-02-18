import Store from "electron-store";
import { randomUUID } from "node:crypto";
import type { Config } from "./types";

export const config = new Store<Config>({
	defaults: {
		accounts: [{ id: randomUUID(), label: "Personal", selected: true }],
	},
});

export function getSelectedAccount() {
	const account = config.get("accounts").find((account) => account.selected);

	if (!account) {
		throw new Error("Could not find selected account");
	}

	return account;
}
