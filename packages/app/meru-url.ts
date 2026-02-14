import { platform } from "@electron-toolkit/utils";
import type { WebContents } from "electron";
import { accounts } from "./accounts";
import { ipc } from "./ipc";
import { main } from "./main";

export const meruUrlArg = !platform.isMacOS
	? process.argv.find((arg) => arg.startsWith("meru://"))
	: undefined;

async function getAccountEmail(
	webContents: WebContents,
): Promise<string | null> {
	if (webContents.isLoading()) {
		await new Promise<void>((resolve) => {
			webContents.once("did-finish-load", resolve);
		});
	}

	return webContents.executeJavaScript(
		`document.querySelector("meta[name='og-profile-acct']")?.getAttribute("content")`,
	);
}

export async function handleMeruUrl(url: string) {
	if (!url.startsWith("meru://")) {
		return;
	}

	const parsed = new URL(url);
	const pathParts = parsed.pathname.split("/").filter(Boolean);

	// Expected format: meru://message/<email>/<messageId>
	if (parsed.hostname !== "message" || pathParts.length !== 2) {
		return;
	}

	const [email, messageId] = pathParts;

	if (!email || !messageId) {
		return;
	}

	for (const [accountId, instance] of accounts.instances) {
		const accountEmail = await getAccountEmail(instance.gmail.view.webContents);

		if (accountEmail === email) {
			accounts.selectAccount(accountId);
			main.show();
			ipc.renderer.send(
				instance.gmail.view.webContents,
				"gmail.openMessage",
				messageId,
			);
			return;
		}
	}
}
