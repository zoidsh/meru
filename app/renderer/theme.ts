import { chromeColors } from "../core/engines/chrome.ts";
import type { Unsubscribe } from "../core/ports.ts";

const DARK = "(prefers-color-scheme: dark)";

/** The part of a MediaQueryList the theme reads. */
export interface ColorScheme {
  readonly matches: boolean;
  readonly addEventListener: (
    type: "change",
    listener: (event: { readonly matches: boolean }) => void
  ) => void;
  readonly removeEventListener: (
    type: "change",
    listener: (event: { readonly matches: boolean }) => void
  ) => void;
}

// The ground and the ink are the window's own background and its title bar overlay's colours too, which main takes from the same table.
const mark = (root: HTMLElement, dark: boolean) => {
  root.classList.toggle("dark", dark);
  const { background, foreground } = chromeColors(dark ? "dark" : "light");
  root.style.setProperty("--background", background);
  root.style.setProperty("--foreground", foreground);
};

/** Marks the root dark or light and sets the chrome's ground and ink: as the page URL's `theme` says for the first paint, then as Chromium's colour scheme, which follows the operating system's. */
export const followTheme = (
  root: HTMLElement,
  url: string,
  media: (query: string) => ColorScheme
): Unsubscribe => {
  const query = media(DARK);
  const given = new URL(url).searchParams.get("theme");
  mark(root, given === null ? query.matches : given === "dark");
  const follow = (event: { readonly matches: boolean }) => {
    mark(root, event.matches);
  };
  query.addEventListener("change", follow);
  return () => {
    query.removeEventListener("change", follow);
  };
};
