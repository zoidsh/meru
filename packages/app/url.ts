import { dialog, shell } from "electron";
import { config } from "@/config";
import { copyText } from "./lib/clipboard";
import { licenseKey } from "./license-key";
import { getIsDefaultBrowser } from "./protocol/default-browser";

export function getCleanUrl(url: string): string {
  if (url.includes("google.com/url")) {
    return new URL(url).searchParams.get("q") ?? url;
  }

  return url;
}

const MAX_EXTERNAL_URL_LENGTH = 256;

export async function openExternalUrl(
  url: string,
  options?: { skipTrustedHostCheck?: boolean; focusBrowser?: boolean },
) {
  const cleanUrl = getCleanUrl(url);

  if (licenseKey.isValid && config.get("externalLinks.confirm")) {
    const { origin } = new URL(cleanUrl);
    const trustedHosts = config.get("externalLinks.trustedHosts");

    if (!options?.skipTrustedHostCheck && !trustedHosts.includes(origin)) {
      const { response, checkboxChecked } = await dialog.showMessageBox({
        type: "info",
        buttons: ["Open link", "Copy link", "Cancel"],
        message: "Open this link in your default browser?",
        checkboxLabel: `Trust all links on ${origin}`,
        detail:
          cleanUrl.length > MAX_EXTERNAL_URL_LENGTH
            ? `${cleanUrl.slice(0, MAX_EXTERNAL_URL_LENGTH - 1)}…`
            : cleanUrl,
      });

      if (response !== 0) {
        if (response === 1) {
          await copyText(cleanUrl);
        }

        return;
      }

      if (checkboxChecked) {
        config.set("externalLinks.trustedHosts", [...trustedHosts, origin]);
      }
    }
  }

  // Outside the confirm dialog above, because most callers skip that one and
  // every one of them reaches here. With Meru holding the https association,
  // `shell.openExternal` asks the operating system for a handler and gets Meru
  // back, a loop that presents as a hang rather than an error.
  if (await getIsDefaultBrowser()) {
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Copy link", "Cancel"],
      message: "Meru can't open this link in a browser.",
      detail:
        "Meru is set as your default browser, so there's no other browser to open it in. Choose another default browser to open links outside Meru.",
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      await copyText(cleanUrl);
    }

    return;
  }

  shell.openExternal(cleanUrl, { activate: options?.focusBrowser });
}
