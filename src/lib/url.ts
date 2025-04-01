import { clipboard, dialog, shell } from "electron";
import { config } from "./config";

export function cleanUrl(url: string): string {
	if (url.includes("google.com/url")) {
		return new URL(url).searchParams.get("q") ?? url;
	}

	return url;
}

export async function openExternalUrl(url: string) {
	const cleanURL = cleanUrl(url);

	if (config.get("externalLinks.confirm")) {
		const { origin } = new URL(cleanURL);
		const trustedHosts = config.get("externalLinks.trustedHosts");

		if (!trustedHosts.includes(origin)) {
			const { response, checkboxChecked } = await dialog.showMessageBox({
				type: "info",
				buttons: ["Open Link", "Copy Link", "Cancel"],
				message:
					"Do you want to open this external link in your default browser?",
				checkboxLabel: `Trust all links on ${origin}`,
				detail: cleanURL,
			});

			if (response === 1) {
				clipboard.writeText(cleanURL);
				return;
			}

			if (response !== 0) return;

			if (checkboxChecked) {
				config.set("externalLinks.trustedHosts", [...trustedHosts, origin]);
			}
		}
	}

	shell.openExternal(url);
}
