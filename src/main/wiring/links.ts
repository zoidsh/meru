import type { Log } from "#core/log.ts";
import type { Platform } from "#core/platform.ts";
import type { Clipboard } from "#platform/clipboard.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import { createDefaultBrowserGuard } from "../default-browser-guard.ts";
import { createLinkOpener } from "../link-opener.ts";
import type { SettingsStore } from "../settings.ts";
import { createTrustedSites } from "../trusted-sites.ts";
import { linkPrompt, systemDefaultBrowser } from "./test-build.ts";

/**
 * The trusted sites; the opener a page's links leave Meru through, which
 * asks first as Ask before opening links says; and the browser Meru's own
 * links open in. Both hold a link while Meru is the default browser.
 */
export const wireLinks = ({
  platform,
  settings,
  systemBrowser,
  clipboard,
  log,
}: {
  platform: Platform;
  settings: Pick<SettingsStore, "get" | "update">;
  systemBrowser: SystemBrowser;
  clipboard: Clipboard;
  log: Log;
}) => {
  const trustedSites = createTrustedSites(settings);
  const defaultBrowser = createDefaultBrowserGuard({
    defaultBrowser: systemDefaultBrowser(platform),
    clipboard,
    log,
  });

  return {
    trustedSites,
    linkOpener: createLinkOpener({
      settings,
      trustedSites,
      defaultBrowser,
      prompt: linkPrompt(),
      systemBrowser,
      clipboard,
      log,
    }),
    ownLinks: defaultBrowser.guard(systemBrowser),
  };
};
