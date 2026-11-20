import type { App } from "#core/apps.ts";
import { contentViewBounds } from "#core/layout.ts";
import type { Platform } from "#core/platform.ts";
import type { TabKey } from "#core/tabs.ts";

import { createBookmarks } from "../bookmarks.ts";
import { createOpenApp } from "../open-app.ts";
import type { Overlays } from "../overlay.ts";
import type { Profiles } from "../profiles.ts";
import type { createShellWindow } from "../shell-window.ts";
import type { Sidebar } from "../sidebar.ts";
import type { createTabViews } from "../tab-views.ts";

/** New tab and Open in split, and the bookmarks they list. */
export const wireLauncher = ({
  platform,
  apps,
  shell,
  sidebar,
  profiles,
  views,
  overlays,
  showOwnWindow,
}: {
  platform: Platform;
  apps: readonly App[];
  shell: ReturnType<typeof createShellWindow>;
  sidebar: Sidebar;
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
    state: profiles.get,
    overlays,
    openTab: views.open,
    splitTab: profiles.splitTab,
    selectTab: views.select,
    showOwnWindow,
    removeBookmark: profiles.removeBookmark,
    pageUrl: livePageUrl,
    pageSize: () =>
      contentViewBounds(
        shell.window.getContentAreaSize(),
        sidebar.current(),
        platform
      ),
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
