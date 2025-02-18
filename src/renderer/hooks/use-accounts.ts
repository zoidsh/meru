import { useEffect, useState } from "react";
import { config } from "@/renderer/lib/ipc";

export function useAccounts() {
	const [accounts, setAccounts] = useState<
		{ id: string; label: string; selected: boolean }[]
	>([]);

	useEffect(() => {
		const initAccounts = async () => {
			const accounts = await config.getAccounts();

			setAccounts(accounts);
		};

		initAccounts();

		return config.onAccountsChanged(setAccounts);
	}, []);

	return accounts;
}
