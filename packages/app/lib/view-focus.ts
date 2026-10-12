/**
 * Where keyboard focus belongs once an account's content is back in front.
 * `"gmail"` is the stand-in for the moment a dormant tab is being materialized
 * and has no view of its own yet.
 */
export type ViewFocusTarget = "activeTab" | "gmail" | null;

export function resolveViewFocusTarget({
  location,
  activeTab,
  hasGmailView,
}: {
  location: string;
  /** A windowed tab is focused through its own window, never through this one. */
  activeTab: { isWindowed: boolean; hasView: boolean };
  hasGmailView: boolean;
}): ViewFocusTarget {
  if (location !== "/" || activeTab.isWindowed) {
    return null;
  }

  if (activeTab.hasView) {
    return "activeTab";
  }

  return hasGmailView ? "gmail" : null;
}
