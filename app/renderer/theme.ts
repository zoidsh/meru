import { chromeColors } from "../core/engines/chrome.ts";
import type { Theme } from "../core/engines/chrome.ts";
import type { Unsubscribe } from "../core/ports.ts";

// The ground and the ink are the window's own background and its title bar overlay's colours too, which main takes from the same table.
const mark = (root: HTMLElement, theme: Theme) => {
  root.classList.toggle("dark", theme === "dark");
  const { background, foreground } = chromeColors(theme);
  root.style.setProperty("--background", background);
  root.style.setProperty("--foreground", foreground);
};

// Main is the source rather than the page's prefers-color-scheme, which Chromium does not change when the app sets nativeTheme.themeSource.
/** Marks the root dark or light and sets the chrome's ground and ink: as the page URL's `theme` says for the first paint, then as each theme `changes` reports. */
export const followTheme = (
  root: HTMLElement,
  url: string,
  changes: (listener: (theme: Theme) => void) => Unsubscribe
): Unsubscribe => {
  mark(
    root,
    new URL(url).searchParams.get("theme") === "dark" ? "dark" : "light"
  );
  return changes((theme) => {
    mark(root, theme);
  });
};
