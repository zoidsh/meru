/*
 * Account and saved-tab config, built up for a seed.
 *
 * Both shapes are wide, and almost none of each matters to a given test. These
 * fill in the parts that don't so that what a test writes out is only what it
 * is actually making a claim about.
 */
import type { AccountConfig, SavedTab } from "@meru/shared/schemas";
import type { SupportedWorkspaceApp } from "@meru/shared/workspace-apps";

/**
 * A pinned tab as the app restores it on the next launch.
 *
 * `loadOnLaunch` is the one worth naming at a call site: it is the difference
 * between a tab that comes back as a live view during startup and one that
 * comes back as an entry in the strip with nothing behind it until it is
 * clicked.
 */
export function seedSavedTab({
  app,
  url,
  title,
  loadOnLaunch = false,
}: {
  app: SupportedWorkspaceApp;
  url: string;
  title: string;
  loadOnLaunch?: boolean;
}): SavedTab {
  return {
    app,
    url,
    title,
    loadOnLaunch,
    hibernatesWhenIdle: null,
    windowed: false,
    opensLinksForApp: null,
  };
}

/**
 * An account, with an id the test chooses rather than a generated one — the
 * account's session is partitioned on that id, so naming it is what lets a test
 * say which account a view is running in.
 */
export function seedAccount({
  id,
  label,
  selected = true,
  savedTabs = [],
}: {
  id: string;
  label: string;
  selected?: boolean;
  savedTabs?: SavedTab[];
}): AccountConfig {
  return {
    id,
    label,
    color: null,
    selected,
    notifications: true,
    gmail: {
      unreadBadge: true,
      delegatedAccountId: null,
      unifiedInbox: true,
    },
    workspaceApps: {
      savedTabs,
      bookmarks: [],
    },
  };
}
