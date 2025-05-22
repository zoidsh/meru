import { platform } from "@electron-toolkit/utils";
import { dialog } from "electron";
import { accounts } from "./accounts";
import { main } from "./main";

export const mailtoUrlArg = !platform.isMacOS
	? process.argv.find((arg) => arg.startsWith("mailto:"))
	: undefined;

export async function handleMailto(url: string) {
	if (!url.startsWith("mailto:") || url === "mailto:") {
		return;
	}

	const accountConfigs = accounts.getAccountConfigs();

	let accountId = accountConfigs[0]?.id;

	if (accountConfigs.length > 1) {
		const cancelId = accountConfigs.length + 1;

		const { response } = await dialog.showMessageBox(main.window, {
			type: "question",
			message: "Compose new email",
			detail: "Which account would you like to use?",
			buttons: [...accountConfigs.map((account) => account.label), "Cancel"],
			cancelId,
		});

		if (response === cancelId) {
			return;
		}

		const accountConfig = accountConfigs[response];

		if (!accountConfig) {
			throw new Error("Could not find account config");
		}

		accountId = accountConfig.id;
	}

	if (!accountId) {
		throw new Error("Could not determine account id");
	}

	accounts.getAccount(accountId).instance.createGmailComposeWindow(url);
}
