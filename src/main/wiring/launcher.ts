import { opensInMeru } from "#core/apps.ts";
import type { App, AppOpening } from "#core/apps.ts";
import { contentViewBounds } from "#core/layout.ts";
import type { ShellFrame } from "#core/layout.ts";
import type { Platform } from "#core/platform.ts";
import type { TabKey } from "#core/tabs.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import { createBookmarks } from "../bookmarks.ts";
import { createOpenApp } from "../open-app.ts";
import type { Overlays } from "../overlay.ts";
import type { Profiles } from "../profiles.ts";
import type { createShellWindow } from "../shell-window.ts";
import type { createTabViews } from "../tab-views.ts";

/** New tab and Open in split, and the bookmarks they list. */
export const wireLauncher = ({
  platform,
  apps,
  appOpening,
  systemBrowser,
  shell,
  frame,
  profiles,
  views,
  overlays,
  showOwnWindow,
}: {
  platform: Platform;
  apps: readonly App[];
  /** Tabs & Apps' settings as they are now, which links follow too. */
  appOpening: () => AppOpening;
  /** The opener a page's links leave Meru through. */
  systemBrowser: SystemBrowser;
  shell: ReturnType<typeof createShellWindow>;
  /** The sidebar and the trial footer as they are now. */
  frame: () => ShellFrame;
  profiles: Profiles;
  views: ReturnType<typeof createTabViews>;
  overlays: Overlays;
  showOwnWindow: (key: TabKey) => void;
}) => {
  const livePageUrl = (key: TabKey) =>
    views.status(key).kind === "live"
      ? views.page(key)?.url || undefined
      : undefined;
  const openApp = createOpenApp({
    apps,
    opensInMeru: (app) => opensInMeru(app, appOpening()),
    systemBrowser,
    state: profiles.get,
    overlays,
    openTab: views.open,
    splitTab: profiles.splitTab,
    selectTab: views.select,
    showOwnWindow,
    removeBookmark: profiles.removeBookmark,
    pageUrl: livePageUrl,
    pageSize: () =>
      contentViewBounds(shell.window.getContentAreaSize(), frame(), platform),
    log: console.error,
  });

  const bookmarks = createBookmarks({
    apps,
    state: profiles.get,
    overlays,
    page: (key) => ({
      live: views.status(key).kind === "live",
      loading: views.navigation(key)?.loading ?? false,
      ...views.page(key),
    }),
    toggle: profiles.toggleBookmark,
    log: console.error,
  });

  return { livePageUrl, openApp, bookmarks };
};
