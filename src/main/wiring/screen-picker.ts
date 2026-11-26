import type { App } from "#core/apps.ts";
import type { Platform } from "#core/platform.ts";
import { usesSystemPicker } from "#core/screen-picker.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { createSessions } from "#platform/sessions.ts";

import type { Downloads } from "../downloads.ts";
import type { Focus } from "../focus.ts";
import type { Overlays } from "../overlay.ts";
import type { OwnWindows } from "../own-windows.ts";
import type { Profiles } from "../profiles.ts";
import { createScreenPicker } from "../screen-picker.ts";
import type { SenderRegistry } from "../senders.ts";
import type { SettingsStore } from "../settings.ts";
import type { createTabViews } from "../tab-views.ts";
import { inOwnWindow } from "./own-windows.ts";
import { screenSources } from "./test-build.ts";

/**
 * Sharing a screen from Meet: every guarded session's display-media
 * handler, Meru's picker it opens, and whether macOS shows its own instead.
 */
export const wireScreenPicker = ({
  platform,
  background,
  apps,
  sessions,
  senders,
  profiles,
  views,
  ownWindows,
  overlays,
  downloads,
  focus,
  settings,
}: {
  platform: Platform;
  /** A run sharing its desktop with other automated sessions, which asks the system nothing. */
  background: boolean;
  apps: readonly App[];
  sessions: ReturnType<typeof createSessions>;
  senders: Pick<SenderRegistry, "identify" | "onDropped">;
  profiles: Pick<Profiles, "onChange">;
  views: ReturnType<typeof createTabViews>;
  ownWindows: OwnWindows;
  overlays: Overlays;
  downloads: Downloads;
  focus: Focus;
  settings: Pick<SettingsStore, "get" | "onChange">;
}) => {
  const { sources, streams } = screenSources(platform, background);
  const picker = createScreenPicker({
    apps,
    platform,
    sources,
    identify: senders.identify,
    inOwnWindow: views.showsInWindow,
    ownWindowOpen: ownWindows.isOpen,
    hasPage: views.hasPage,
    overlays,
    log: console.error,
  });

  sessions.handleDisplayMedia(picker.request, streams);

  // The store tells a gated key's listeners when its capability changes too.
  const followSetting = () => {
    sessions.useSystemPicker(
      usesSystemPicker(platform, settings.get("systemScreenPicker"))
    );
  };

  followSetting();
  settings.onChange("systemScreenPicker", followSetting);

  profiles.onChange(picker.follow);
  views.onChange(picker.follow);
  senders.onDropped(picker.dropped);
  ownWindows.onClosed(picker.closeIn);

  // A tab's own window shows one card: the one opened last takes the slot.
  picker.onChange(() => {
    const shown = downloads.window();

    if (shown && picker.windowCard(shown)) {
      downloads.closeIn(shown);
    }
  });
  downloads.onChange(() => {
    const shown = downloads.window();

    if (shown && picker.windowCard(shown)) {
      picker.closeIn(shown);
    }
  });
  picker.onClosedIn((key) => {
    focus.focusInWindow(key, inOwnWindow(key));
  });

  return {
    screenPicker: picker,
    /** Whether a card, of either kind, is open in the tab's own window. */
    hasWindowCard: (key: TabKey) => {
      const shown = downloads.window();

      return (
        picker.windowCard(key) !== undefined ||
        (shown !== undefined && tabKey(shown) === tabKey(key))
      );
    },
  };
};
