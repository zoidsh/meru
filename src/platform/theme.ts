import { nativeTheme } from "electron";

export interface Theme {
  /** Whether the system, or the theme Meru was given, is dark. */
  isDark: () => boolean;
  onChange: (listener: () => void) => void;
}

export const createTheme = (): Theme => ({
  isDark: () => nativeTheme.shouldUseDarkColors,
  onChange: (listener) => {
    nativeTheme.on("updated", listener);
  },
});
