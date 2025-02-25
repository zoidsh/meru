import { randomUUID } from "node:crypto";
import type { Gmail, GmailNavigationHistory } from "@/gmail";
import type { Main } from "@/main";
import { initTRPC } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { is } from "electron-util";
import z from "zod";
import { config } from "./config";
import { type Account, type Accounts, accountSchema } from "./config/types";

const t = initTRPC.create({ isServer: true });

export function createIpcRouter({ main, gmail }: { main: Main; gmail: Gmail }) {
	return t.router({
		getTitle: t.procedure.query(() => main.title),
		onTitleChanged: t.procedure.subscription(() => {
			return observable<string>((emit) => {
				main.onTitleChanged((title) => {
					emit.next(title);
				});
			});
		}),
		getAccounts: t.procedure.query(() => config.get("accounts")),
		onAccountsUpdated: t.procedure.subscription(() => {
			return observable<Accounts>((emit) => {
				return config.onDidChange("accounts", (accounts) => {
					if (accounts) {
						emit.next(accounts);
					}
				});
			});
		}),
		selectAccount: t.procedure.input(accountSchema).mutation(({ input }) => {
			config.set(
				"accounts",
				config.get("accounts").map((account) => {
					if (account.id === input.id) {
						gmail.selectView(account);
					}

					return { ...account, selected: account.id === input.id };
				}),
			);
		}),
		addAccount: t.procedure
			.input(accountSchema.pick({ label: true }))
			.mutation(({ input }) => {
				const addedAccount: Account = {
					id: randomUUID(),
					selected: false,
					...input,
				};

				const updatedAccounts = [...config.get("accounts"), addedAccount];

				config.set("accounts", updatedAccounts);

				gmail.createView(addedAccount);

				const { width, height } = main.window.getBounds();

				gmail.setAllViewBounds({
					width,
					height,
					sidebarInset: updatedAccounts.length > 1,
				});
			}),
		removeAccount: t.procedure
			.input(accountSchema.pick({ id: true }))
			.mutation(({ input }) => {
				const updatedAccounts = config
					.get("accounts")
					.filter((account) => account.id !== input.id);

				gmail.removeView(input);

				if (updatedAccounts.every((account) => account.selected === false)) {
					updatedAccounts[0].selected = true;

					gmail.selectView(updatedAccounts[0]);
				}

				const { width, height } = main.window.getBounds();

				gmail.setAllViewBounds({
					width,
					height,
					sidebarInset: updatedAccounts.length > 1,
				});

				config.set("accounts", updatedAccounts);
			}),
		editAccount: t.procedure
			.input(accountSchema.pick({ id: true, label: true }))
			.mutation(({ input }) => {
				config.set(
					"accounts",
					config
						.get("accounts")
						.map((account) =>
							account.id === input.id ? { ...account, ...input } : account,
						),
				);
			}),
		moveAccount: t.procedure
			.input(
				z.object({
					account: accountSchema.pick({ id: true }),
					move: z.enum(["up", "down"]),
				}),
			)
			.mutation(({ input }) => {
				const accounts = config.get("accounts");

				const accountIndex = accounts.findIndex(
					(account) => account.id === input.account.id,
				);

				const account = accounts.splice(accountIndex, 1)[0];

				accounts.splice(
					input.move === "up"
						? accountIndex - 1
						: input.move === "down"
							? accountIndex + 1
							: accountIndex,
					0,
					account,
				);

				config.set("accounts", accounts);
			}),
		window: t.router({
			control: t.procedure
				.input(z.enum(["minimize", "maximize", "unmaximize", "close"]))
				.mutation(({ input }) => {
					switch (input) {
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
				}),
			getIsMaximized: t.procedure.query(() => {
				return main.window.isMaximized();
			}),
			onMaximizedChanged: t.procedure.subscription(() => {
				return observable<boolean>((emit) => {
					const maximizeListener = () => {
						emit.next(true);
					};

					const unmaximizeListener = () => {
						emit.next(false);
					};

					main.window
						.on("maximize", maximizeListener)
						.on("unmaximize", unmaximizeListener);

					return () => {
						main.window
							.off("maximize", maximizeListener)
							.off("unmaximize", unmaximizeListener);
					};
				});
			}),
		}),
		gmail: t.router({
			getNavigationHistory: t.procedure.query(() =>
				gmail.getNavigationHistory(),
			),
			onNavigationHistoryChanged: t.procedure.subscription(() => {
				return observable<GmailNavigationHistory>((emit) => {
					return gmail.onNavigationHistoryChanged((navigationHistory) => {
						emit.next(navigationHistory);
					});
				});
			}),
			navigationHistoryGo: t.procedure
				.input(z.enum(["back", "forward"]))
				.mutation(({ input }) => {
					gmail.go(input);
				}),
			reload: t.procedure.mutation(() => {
				gmail.reload();
			}),
			getVisible: t.procedure.query(() => gmail.visible),
			toggleVisible: t.procedure.mutation(() => {
				gmail.toggleVisible();
			}),
			onVisibleChanged: t.procedure.subscription(() => {
				return observable<boolean>((emit) => {
					return gmail.onVisibleChanged((visible) => {
						emit.next(visible);
					});
				});
			}),
		}),
	});
}

export type IpcRouter = ReturnType<typeof createIpcRouter>;
