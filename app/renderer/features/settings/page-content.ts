import type { ReactNode } from "react";

import type { SettingsPageId } from "../../../shared/settings/registry.ts";

/** What a feature shows on a settings page above the page's registry fields, for what the registry does not hold. */
export interface PageContent {
  readonly page: SettingsPageId;
  readonly Content: () => ReactNode;
}
