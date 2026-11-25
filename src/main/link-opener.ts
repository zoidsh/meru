import { t } from "@lingui/core/macro";

import {
  asksBeforeOpening,
  shownUrl,
  siteName,
  trustableSite,
} from "#core/trusted-sites.ts";
import type { Clipboard } from "#platform/clipboard.ts";
import type { LinkPrompt, LinkQuestion } from "#platform/link-prompt.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import type { DefaultBrowserGuard } from "./default-browser-guard.ts";
import type { SettingsStore } from "./settings.ts";
import type { TrustedSites } from "./trusted-sites.ts";

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const trustLabel = (name: string) =>
  t({
    message: `Always open links to ${name} without asking`,
    comment:
      "Checkbox in the dialog that asks before a link opens in the default browser; {name} is the site, such as example.com, which is then listed under Trusted sites in Settings",
  });

const question = (url: string, site: string | undefined): LinkQuestion => ({
  message: t({
    message: "Open this link in your default browser?",
    comment:
      "Question in the dialog Meru shows before a link from a page opens in the person's web browser; the link shows below it",
  }),
  detail: shownUrl(url),
  openLabel: t({
    message: "Open Link",
    comment:
      "Button in the dialog that asks before a link opens in the default browser, which opens it there",
  }),
  copyLabel: t({
    message: "Copy Link",
    comment:
      "Button in the dialog that asks before a link opens in the default browser, which copies it and opens nothing",
  }),
  cancelLabel: t({
    message: "Cancel",
    comment:
      "Button in the dialog that asks before a link opens in the default browser, which opens nothing",
  }),
  ...(site === undefined ? {} : { trustLabel: trustLabel(siteName(site)) }),
});

/**
 * Opens a link a page sends out of Meru in the default browser, first asking
 * as Ask before opening links says, unless its site is trusted. Meru's own
 * links, such as a tab's Open in Browser, go to the browser directly. While
 * Meru is the default browser nothing is asked: the guard's alert says why
 * the link stays.
 */
export const createLinkOpener = ({
  settings,
  trustedSites,
  defaultBrowser,
  prompt,
  systemBrowser,
  clipboard,
  log,
}: {
  settings: Pick<SettingsStore, "get">;
  trustedSites: TrustedSites;
  defaultBrowser: Pick<DefaultBrowserGuard, "holds">;
  prompt: LinkPrompt;
  systemBrowser: SystemBrowser;
  clipboard: Clipboard;
  log: (message: string) => void;
}): SystemBrowser => ({
  open: async (url) => {
    if (await defaultBrowser.holds(url)) {
      return;
    }

    if (
      asksBeforeOpening(url, {
        confirm: settings.get("confirmLinks"),
        trusted: trustedSites.list(),
      })
    ) {
      const site = trustableSite(url);
      const { choice, trust } = await prompt.ask(question(url, site));

      if (choice === "copy") {
        await clipboard.writeText(url);

        return;
      }

      if (choice !== "open") {
        return;
      }

      if (trust && site) {
        try {
          await trustedSites.add(site);
        } catch (error) {
          log(`A trusted site was not saved: ${describe(error)}`);
        }
      }
    }

    await systemBrowser.open(url);
  },
});
