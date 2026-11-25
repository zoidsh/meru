import { nativeTheme } from "electron";

import type { ThemeChoice } from "#core/settings.ts";

export interface Theme {
  /** Whether Meru's windows are dark: the theme chosen, else the system's. */
  isDark: () => boolean;
  /**
   * Whether the taskbar, where the tray icon sits, is dark whatever theme
   * Meru was given. Only Windows tells it apart; on Linux, once Meru is given
   * light or dark, Electron answers with Meru's.
   */
  systemIsDark: () => boolean;
  /**
   * Sets every window's theme, native menus and dialogs included, and what
   * `prefers-color-scheme` says in each page; "system" follows the system.
   */
  setSource: (source: ThemeChoice) => void;
  onChange: (listener: () => void) => void;
}

export const createTheme = (): Theme => ({
  isDark: () => nativeTheme.shouldUseDarkColors,
  systemIsDark: () =>
    process.platform === "win32"
      ? nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
      : nativeTheme.shouldUseDarkColors,
  setSource: (source) => {
    nativeTheme.themeSource = source;
  },
  onChange: (listener) => {
    nativeTheme.on("updated", listener);
  },
});
