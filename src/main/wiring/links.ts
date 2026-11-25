import type { Clipboard } from "#platform/clipboard.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import { createLinkOpener } from "../link-opener.ts";
import type { SettingsStore } from "../settings.ts";
import { createTrustedSites } from "../trusted-sites.ts";
import { linkPrompt } from "./test-build.ts";

/**
 * The trusted sites, and the opener a page's links leave Meru through, which
 * asks first as Ask before opening links says.
 */
export const wireLinks = ({
  settings,
  systemBrowser,
  clipboard,
}: {
  settings: Pick<SettingsStore, "get" | "update">;
  systemBrowser: SystemBrowser;
  clipboard: Clipboard;
}) => {
  const trustedSites = createTrustedSites(settings);

  return {
    trustedSites,
    linkOpener: createLinkOpener({
      settings,
      trustedSites,
      prompt: linkPrompt(),
      systemBrowser,
      clipboard,
      log: console.error,
    }),
  };
};
