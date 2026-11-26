import { appForUrl, opensInMeru } from "./apps.ts";
import type { App, AppOpening } from "./apps.ts";
import {
  isGoogleRedirect,
  isWebUrl,
  unwrapGoogleRedirect,
} from "./google-redirect.ts";

/**
 * What happens to a window a page in a content view, or a window it opened,
 * asks to open: a window of its own in the same session, a tab of an app in
 * the same profile, a hand-off of `url` to the system browser, a new profile,
 * a download the asking page starts, or nothing.
 */
export type WindowOpenRoute =
  | { kind: "child-window" }
  | { kind: "download" }
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
  /**
   * Tabs & Apps' settings, which send a link to another app to the system
   * browser rather than a tab.
   */
  opening: AppOpening;
}

const parseWebUrl = (url: string) => {
  const parsed = URL.parse(url);

  return parsed && isWebUrl(parsed) ? parsed : undefined;
};

/** Google's "Add another account", which Meru answers with a profile. */
const isAddSession = (url: URL, signInOrigins: readonly string[]) => {
  const path = url.pathname.toLowerCase();

  return (
    signInOrigins.includes(url.origin) &&
    (path === "/addsession" || path.startsWith("/addsession/"))
  );
};

/**
 * A Google Chat attachment: a download behind a Chat address, so a window or
 * tab opened for it would never paint.
 */
const isChatAttachment = (url: URL) =>
  url.hostname === "chat.google.com" &&
  /^\/u\/\d+\/api\/get_attachment_url(?:\/|$)/u.test(url.pathname);

/**
 * Google's secure PDF viewer, which a Gmail, Drive or Chat attachment opens
 * in, served from a `doc-<n>-<n>-apps-viewer` host of googleusercontent.com.
 */
const isSecurePdfViewer = (url: URL) =>
  url.protocol === "https:" &&
  url.hostname.endsWith("-apps-viewer.googleusercontent.com") &&
  /^\/viewer\/secure\/pdf(?:\/|$)/u.test(url.pathname);

/** Gmail's inbox at `/`, `/mail/u/<n>` or `/mail/u/<n>/`, with no query. */
const isInboxRoot = (url: URL) =>
  !url.search && /^\/(?:mail\/u\/\d+\/?)?$/u.test(url.pathname);

export const routeWindowOpen = (
  url: string,
  { signInOrigins, apps, openerApp, opening }: WindowOpenContext,
  {
    inBackground = false,
  }: {
    /** Asked for as a tab behind the page, as a middle click asks. */
    inBackground?: boolean;
  } = {}
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

  if (isChatAttachment(parsed)) {
    return { kind: "download" };
  }

  // A window would come in front of the page, which a tab behind it asks not
  // to; the system browser opens that one.
  if (isSecurePdfViewer(parsed) && !inBackground) {
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

  // Matched against every app first, so a sheet left out never falls to
  // Docs' claim on the rest of docs.google.com.
  if (app.id !== openerApp && !opensInMeru(app, opening)) {
    return { kind: "system-browser", url };
  }

  return { kind: "tab", app };
};

/**
 * Whether a window a page opened may go to `url` itself: sign-in, Google's
 * secure PDF viewer, or a page of the app whose tab opened it. Anything else,
 * "Add another account" included, is routed as a window open.
 */
export const allowsChildNavigation = (
  url: string,
  { signInOrigins, apps, openerApp }: WindowOpenContext
) => {
  const parsed = parseWebUrl(url);

  return (
    parsed !== undefined &&
    !isAddSession(parsed, signInOrigins) &&
    (signInOrigins.includes(parsed.origin) ||
      isSecurePdfViewer(parsed) ||
      appForUrl(apps, url)?.id === openerApp)
  );
};
