import { clipboard, dialog, shell } from "electron";
import { config } from "@/config";
import { licenseKey } from "./license-key";

export function getCleanUrl(url: string): string {
	if (url.includes("google.com/url")) {
		return new URL(url).searchParams.get("q") ?? url;
	}

	return url;
}

export async function openExternalUrl(url: string, trustedLink?: boolean) {
	const cleanUrl = getCleanUrl(url);

	if (licenseKey.isValid && config.get("externalLinks.confirm")) {
		const { origin } = new URL(cleanUrl);
		const trustedHosts = config.get("externalLinks.trustedHosts");

		if (!trustedLink && !trustedHosts.includes(origin)) {
			const { response, checkboxChecked } = await dialog.showMessageBox({
				type: "info",
				buttons: ["Open Link", "Copy Link", "Cancel"],
				message:
					"Do you want to open this external link in your default browser?",
				checkboxLabel: `Trust all links on ${origin}`,
				detail: cleanUrl,
			});

			if (response !== 0) {
				if (response === 1) {
					clipboard.writeText(cleanUrl);
				}

				return;
			}

			if (checkboxChecked) {
				config.set("externalLinks.trustedHosts", [...trustedHosts, origin]);
			}
		}
	}

	shell.openExternal(cleanUrl);
}
