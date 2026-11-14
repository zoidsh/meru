import type { ReactNode } from "react";

import type { SettingsPageId } from "../../../shared/settings/registry.ts";

/** What a feature shows on a settings page, for what the registry does not hold: above the page's registry fields, or under them while `below` is on. */
export interface PageContent {
  readonly page: SettingsPageId;
  readonly Content: () => ReactNode;
  readonly below?: boolean;
}
