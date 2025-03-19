import { randomUUID } from "node:crypto";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import type { Main } from ".";
import type { Gmail } from "../gmail";
import { config } from "../lib/config";
import type { Account, Accounts } from "../lib/config/types";

export type IpcMainEvents =
	| {
			selectAccount: [selectedAccountId: Account["id"]];
			addAccount: [addedAccount: Pick<Account, "label">];
			removeAccount: [removedAccountId: Account["id"]];
			updateAccount: [updatedAccount: Account];
			moveAccount: [movedAccountId: Account["id"], direction: "up" | "down"];
			controlWindow: [action: "minimize" | "maximize" | "unmaximize" | "close"];
			goNavigationHistory: [action: "back" | "forward"];
			reload: [];
			toggleGmailVisible: [];
	  }
	| {
			getTitle: () => string;
			getAccounts: () => Accounts;
			getWindowMaximized: () => boolean;
			getNavigationHistory: () => { canGoBack: boolean; canGoForward: boolean };
			getGmailVisible: () => boolean;
	  };

export type IpcRendererEvent = {
	onTitleChanged: [title: string];
	onAccountsChanged: [accounts: Accounts];
	onWindowMaximizedChanged: [maximized: boolean];
	onNavigationHistoryChanged: [
		navigationHistory: { canGoBack: boolean; canGoForward: boolean },
	];
	onGmailVisibleChanged: [visible: boolean];
};

export function initMainIpc({ main, gmail }: { main: Main; gmail: Gmail }) {
	const ipc = new IpcListener<IpcMainEvents>();

	const emitter = new IpcEmitter<IpcRendererEvent>();

	ipc.handle("getTitle", () => main.title);

	main.onTitleChanged((title) => {
		emitter.send(main.window.webContents, "onTitleChanged", title);
	});

	ipc.handle("getAccounts", () => config.get("accounts"));

	config.onDidChange("accounts", (accounts) => {
		if (accounts) {
			emitter.send(main.window.webContents, "onAccountsChanged", accounts);
		}
	});

	ipc.on("selectAccount", (_event, selectedAccountId) => {
		config.set(
			"accounts",
			config.get("accounts").map((account) => {
				if (account.id === selectedAccountId) {
					gmail.selectView(account);
				}

				return { ...account, selected: account.id === selectedAccountId };
			}),
		);
	});

	ipc.on("addAccount", (_event, addedAccount) => {
		const account: Account = {
			id: randomUUID(),
			selected: false,
			...addedAccount,
		};

		const accounts = [...config.get("accounts"), account];

		config.set("accounts", accounts);

		gmail.createView(account);

		const { width, height } = main.window.getBounds();

		gmail.setAllViewBounds({
			width,
			height,
			sidebarInset: accounts.length > 1,
		});
	});

	ipc.on("removeAccount", (_event, removeAccountId) => {
		const accounts = config
			.get("accounts")
			.filter((account) => account.id !== removeAccountId);

		gmail.removeView(removeAccountId);

		if (accounts.every((account) => account.selected === false)) {
			accounts[0].selected = true;

			gmail.selectView(accounts[0]);
		}

		const { width, height } = main.window.getBounds();

		gmail.setAllViewBounds({
			width,
			height,
			sidebarInset: accounts.length > 1,
		});

		config.set("accounts", accounts);
	});

	ipc.on("updateAccount", (_event, updatedAccount) => {
		config.set(
			"accounts",
			config
				.get("accounts")
				.map((account) =>
					account.id === updatedAccount.id
						? { ...account, ...updatedAccount }
						: account,
				),
		);
	});

	ipc.on("moveAccount", (_event, movedAccountId, direction) => {
		const accounts = config.get("accounts");

		const accountIndex = accounts.findIndex(
			(account) => account.id === movedAccountId,
		);

		const account = accounts.splice(accountIndex, 1)[0];

		accounts.splice(
			direction === "up"
				? accountIndex - 1
				: direction === "down"
					? accountIndex + 1
					: accountIndex,
			0,
			account,
		);

		config.set("accounts", accounts);
	});

	ipc.handle("getWindowMaximized", () => main.window.isMaximized());

	ipc.on("controlWindow", (_event, action) => {
		switch (action) {
			case "minimize": {
				main.window.minimize();
				break;
			}
			case "maximize": {
				main.window.maximize();
				break;
			}
			case "unmaximize": {
				main.window.unmaximize();
				break;
			}
			case "close": {
				main.window.close();
				break;
			}
		}
	});

	main.window
		.on("maximize", () => {
			emitter.send(main.window.webContents, "onWindowMaximizedChanged", true);
		})
		.on("unmaximize", () => {
			emitter.send(main.window.webContents, "onWindowMaximizedChanged", true);
		});

	ipc.handle("getNavigationHistory", () => {
		return gmail.getNavigationHistory();
	});

	gmail.onNavigationHistoryChanged((navigationHistory) => {
		emitter.send(
			main.window.webContents,
			"onNavigationHistoryChanged",
			navigationHistory,
		);
	});

	ipc.on("goNavigationHistory", (_event, action) => {
		gmail.go(action);
	});

	ipc.on("reload", () => {
		gmail.reload();
	});

	ipc.handle("getGmailVisible", () => gmail.visible);

	ipc.on("toggleGmailVisible", () => {
		gmail.toggleVisible();
	});

	gmail.onVisibleChanged((visible) => {
		emitter.send(main.window.webContents, "onGmailVisibleChanged", visible);
	});
}
