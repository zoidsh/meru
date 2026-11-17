import { appForUrl } from "./apps.ts";
import type { App } from "./apps.ts";

/**
 * What happens to a window a page in a content view asks to open: a child
 * window in the same session, a tab of an app in the same profile, a hand-off
 * to the system browser, or nothing.
 */
export type WindowOpenRoute =
  | { kind: "child-window" }
  | { kind: "tab"; app: App }
  | { kind: "system-browser" }
  | { kind: "deny" };

/** Google's sign-in and its own pop-ups, the origin v3 lets open as a window. */
export const SIGN_IN_ORIGINS: readonly string[] = [
  "https://accounts.google.com",
];

export interface WindowOpenContext {
  childWindowOrigins: readonly string[];
  apps: readonly App[];
  /** The app of the tab whose page, or whose page's window, asked. */
  openerApp: string;
}

/**
 * Adding a Google account, refused: v3 answers it with the profile settings,
 * which do not exist yet.
 */
const isAddSession = (url: URL) =>
  url.host === "accounts.google.com" &&
  url.pathname.toLowerCase().startsWith("/addsession");

export const routeWindowOpen = (
  url: string,
  { childWindowOrigins, apps, openerApp }: WindowOpenContext
): WindowOpenRoute => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return { kind: "deny" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { kind: "deny" };
  }

  if (isAddSession(parsed)) {
    return { kind: "deny" };
  }

  if (childWindowOrigins.includes(parsed.origin)) {
    return { kind: "child-window" };
  }

  const app = appForUrl(apps, url);

  if (!app) {
    return { kind: "system-browser" };
  }

  // Its own pop-outs, such as Gmail's compose window, belong in a window of
  // the profile's session, which does not exist yet.
  if (app.singleInstance && app.id === openerApp) {
    return { kind: "deny" };
  }

  return { kind: "tab", app };
};
