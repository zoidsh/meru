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

/** Marks the root dark or light: as the page URL's `theme` says for the first paint, then as Chromium's colour scheme, which follows the operating system's. */
export const followTheme = (
  root: HTMLElement,
  url: string,
  media: (query: string) => ColorScheme
): Unsubscribe => {
  const query = media(DARK);
  const given = new URL(url).searchParams.get("theme");
  root.classList.toggle(
    "dark",
    given === null ? query.matches : given === "dark"
  );
  const follow = (event: { readonly matches: boolean }) => {
    root.classList.toggle("dark", event.matches);
  };
  query.addEventListener("change", follow);
  return () => {
    query.removeEventListener("change", follow);
  };
};
