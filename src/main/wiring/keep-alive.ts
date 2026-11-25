import type { App } from "#core/apps.ts";
import { ROTATING_COOKIE } from "#core/keep-alive.ts";
import type { KeepAliveTiming } from "#core/keep-alive.ts";
import { allowsPermission } from "#core/permissions.ts";
import { keptAliveProfileIds } from "#core/state.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import { createKeepAlivePages } from "#platform/keep-alive.ts";
import type { createNetwork } from "#platform/network.ts";
import type { createSessions } from "#platform/sessions.ts";

import type { ContentBlocker } from "../content-blocker.ts";
import { createKeepAlive } from "../keep-alive.ts";
import type { MailPoller } from "../mail.ts";
import type { Profiles } from "../profiles.ts";
import type { createTabViews } from "../tab-views.ts";

/**
 * The keep-alive of each profile's Google sign-in, following the profiles and
 * the views, and stopped as the app quits.
 */
export const wireKeepAlive = ({
  apps,
  lifecycle,
  sessions,
  contentBlocker,
  network,
  profiles,
  views,
  mail,
  keepAliveUrl,
  keepAliveTiming,
}: {
  apps: readonly App[];
  lifecycle: ReturnType<typeof createAppLifecycle>;
  sessions: ReturnType<typeof createSessions>;
  contentBlocker: ContentBlocker;
  network: ReturnType<typeof createNetwork>;
  profiles: Profiles;
  views: ReturnType<typeof createTabViews>;
  mail: MailPoller;
  keepAliveUrl: string;
  keepAliveTiming: KeepAliveTiming;
}) => {
  const keepAlive = createKeepAlive({
    pages: createKeepAlivePages(),
    profileIds: () => keptAliveProfileIds(profiles.get()),
    hasView: views.hasView,
    signedOut: (profileId) => mail.mail(profileId).status === "signedOut",
    isOnline: network.isOnline,
    prepareSession: (partition) => {
      sessions.guard(partition, (ask) => allowsPermission(apps, ask));
      contentBlocker.prepare(partition);
    },
    url: keepAliveUrl,
    cookie: ROTATING_COOKIE,
    timing: keepAliveTiming,
    now: Date.now,
    log: console.error,
  });

  // After the views, so a profile given one closes its keep-alive.
  profiles.onChange(keepAlive.follow);
  views.onChange(keepAlive.follow);
  lifecycle.onBeforeQuit(keepAlive.dispose);
};
