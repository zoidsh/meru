/**
 * SPIKE: what `chrome.windows.create` says over the extension bridge.
 *
 * Bitwarden's sign-in and unlock surfaces are `windows.create` popouts of its
 * own `popup/index.html`, so a facade noop leaves the extension with no way to
 * log in or unlock at all.
 */

export const WINDOWS_PATHS = {
  create: "/windows/create",
  remove: "/windows/remove",
} as const;

/** What the extension handed to `create`, taken as untrusted. */
export type WindowsCreateInfo = {
  url?: unknown;
  width?: unknown;
  height?: unknown;
  type?: unknown;
  focused?: unknown;
};

export type WindowsWindow = {
  id: number;
  focused: boolean;
  incognito: false;
  alwaysOnTop: false;
  state: "normal";
  type: "popup" | "normal";
  top: number;
  left: number;
  width: number;
  height: number;
  tabs: [];
};
