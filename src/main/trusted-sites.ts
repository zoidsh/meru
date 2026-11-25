import { withSite, withoutSite } from "#core/trusted-sites.ts";

import type { SettingsStore } from "./settings.ts";

/**
 * The sites whose links open without asking, read and changed here alone:
 * the link prompt adds to it, and the Settings page lists and removes, one
 * site at a time against the list as stored.
 */
export const createTrustedSites = (
  settings: Pick<SettingsStore, "get" | "update">
) => ({
  /** Each an origin, in the order added. */
  list: () => settings.get("trustedSites"),
  add: (site: string) =>
    settings.update("trustedSites", (trusted) => withSite(trusted, site)),
  remove: (site: string) =>
    settings.update("trustedSites", (trusted) => withoutSite(trusted, site)),
});

export type TrustedSites = ReturnType<typeof createTrustedSites>;
