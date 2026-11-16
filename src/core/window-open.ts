/**
 * What happens to a window a page in a content view asks to open: a child
 * window in the same session, a hand-off to the system browser, or nothing.
 */
export type WindowOpenRoute = "child-window" | "system-browser" | "deny";

/** Google's sign-in and its own pop-ups, the host v3 lets open as a window. */
const CHILD_WINDOW_HOSTS = new Set(["accounts.google.com"]);

/**
 * Refused until the slice that gives each a home: Gmail's pop-outs, which
 * belong in a window of the profile's session, never the system browser's,
 * and adding a Google account, which v3 answers with its settings window.
 */
const LATER_SLICE = [
  (url: URL) => url.host === "mail.google.com",
  (url: URL) =>
    url.host === "accounts.google.com" &&
    url.pathname.startsWith("/AddSession"),
];

export const routeWindowOpen = (url: string): WindowOpenRoute => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return "deny";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "deny";
  }

  if (LATER_SLICE.some((matches) => matches(parsed))) {
    return "deny";
  }

  if (parsed.protocol === "https:" && CHILD_WINDOW_HOSTS.has(parsed.host)) {
    return "child-window";
  }

  return "system-browser";
};
