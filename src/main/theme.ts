import type { Theme } from "#platform/theme.ts";

import type { SettingsStore } from "./settings.ts";

/**
 * Gives every window of Meru the theme `theme` says, now and on each change.
 * Called before the first window is made, so none paints in the other one.
 */
export const followThemeSetting = ({
  theme,
  settings,
}: {
  theme: Pick<Theme, "setSource">;
  settings: Pick<SettingsStore, "get" | "onChange">;
}) => {
  const apply = () => {
    theme.setSource(settings.get("theme"));
  };

  apply();
  settings.onChange("theme", apply);
};
