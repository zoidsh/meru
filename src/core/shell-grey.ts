/**
 * The shell's colour, behind the titlebar and the strip, light and dark. The
 * `--shell` token in `src/ui/styles.css` holds the same two values, which a
 * test keeps equal.
 */
export const SHELL_GREY = {
  light: "#ebebeb",
  dark: "#1d1d1d",
} as const;

/** The window's own colour, which shows before the shell paints and as it resizes. */
export const windowBackground = (isDark: boolean) =>
  isDark ? SHELL_GREY.dark : SHELL_GREY.light;
