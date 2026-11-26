import type { createAppLifecycle } from "#platform/app.ts";
import type { Power } from "#platform/power.ts";

import { createIdleSleep } from "../idle-sleep.ts";
import type { Profiles } from "../profiles.ts";
import type { SettingsStore } from "../settings.ts";
import type { createTabViews } from "../tab-views.ts";

/**
 * Idle tabs put to sleep, following the tabs, their pages, Tabs & Google Apps'
 * two settings and the computer waking, and stopped as the app quits.
 */
export const wireIdleSleep = ({
  lifecycle,
  settings,
  profiles,
  views,
  power,
}: {
  lifecycle: ReturnType<typeof createAppLifecycle>;
  settings: Pick<SettingsStore, "get" | "onChange">;
  profiles: Profiles;
  views: ReturnType<typeof createTabViews>;
  power: Power;
}) => {
  const idleSleep = createIdleSleep({
    state: profiles.get,
    which: () => settings.get("sleepIdleTabs"),
    after: () => settings.get("sleepAfter"),
    hasPage: views.hasPage,
    audible: views.audible,
    sleep: views.sleep,
    now: Date.now,
  });

  // After the views, so a tab selected again has its page back.
  profiles.onChange(idleSleep.follow);
  views.onChange(idleSleep.follow);
  settings.onChange("sleepIdleTabs", idleSleep.follow);
  settings.onChange("sleepAfter", idleSleep.follow);
  power.onResume(idleSleep.follow);
  lifecycle.onBeforeQuit(idleSleep.dispose);
  idleSleep.follow();
};
