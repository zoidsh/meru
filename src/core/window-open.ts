import { appForUrl } from "./apps.ts";
import type { App } from "./apps.ts";
import { isGoogleRedirect, unwrapGoogleRedirect } from "./google-redirect.ts";

/**
 * What happens to a window a page in a content view, or a window it opened,
 * asks to open: a window of its own in the same session, a tab of an app in
 * the same profile, a hand-off of `url` to the system browser, a new profile,
 * or nothing.
 */
export type WindowOpenRoute =
  | { kind: "child-window" }
  | { kind: "tab"; app: App }
  | { kind: "system-browser"; url: string }
  | { kind: "add-profile" }
  | { kind: "deny" };

/** Google's sign-in, whose pop-ups open as windows. */
export const SIGN_IN_ORIGINS: readonly string[] = [
  "https://accounts.google.com",
];

export interface WindowOpenContext {
  signInOrigins: readonly string[];
  apps: readonly App[];
  /** The app of the tab whose page, or whose page's window, asked. */
  openerApp: string;
}

const parseWebUrl = (url: string) => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
    !parsed.username &&
    !parsed.password
    ? parsed
    : undefined;
};

/** Google's "Add another account", which Meru answers with a profile. */
const isAddSession = (url: URL, signInOrigins: readonly string[]) =>
  signInOrigins.includes(url.origin) &&
  url.pathname.toLowerCase().startsWith("/addsession");

/** Gmail's inbox at `/`, `/mail/u/<n>` or `/mail/u/<n>/`, with no query. */
const isInboxRoot = (url: URL) =>
  !url.search && /^\/(?:mail\/u\/\d+\/?)?$/u.test(url.pathname);

export const routeWindowOpen = (
  url: string,
  { signInOrigins, apps, openerApp }: WindowOpenContext
): WindowOpenRoute => {
  const parsed = parseWebUrl(url);

  if (!parsed) {
    return { kind: "deny" };
  }

  if (isAddSession(parsed, signInOrigins)) {
    return { kind: "add-profile" };
  }

  if (signInOrigins.includes(parsed.origin)) {
    return { kind: "child-window" };
  }

  if (isGoogleRedirect(parsed)) {
    return { kind: "system-browser", url: unwrapGoogleRedirect(url) ?? url };
  }

  const app = appForUrl(apps, url);

  if (!app) {
    return { kind: "system-browser", url };
  }

  // A single-instance app's own pop-outs, such as Gmail's compose, message,
  // attachment and print windows and its "View entire message", are windows
  // in the session. Its inbox is its one tab.
  if (app.singleInstance && app.id === openerApp && !isInboxRoot(parsed)) {
    return { kind: "child-window" };
  }

  return { kind: "tab", app };
};

/**
 * Whether a window a page opened may go to `url` itself: sign-in, or a page
 * of the app whose tab opened it. Anything else is routed as a window open.
 */
export const allowsChildNavigation = (
  url: string,
  { signInOrigins, apps, openerApp }: WindowOpenContext
) => {
  const parsed = parseWebUrl(url);

  return (
    parsed !== undefined &&
    (signInOrigins.includes(parsed.origin) ||
      appForUrl(apps, url)?.id === openerApp)
  );
};
