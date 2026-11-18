import { findApp } from "#core/apps.ts";
import type { App } from "#core/apps.ts";
import { FEED_PATH, feedOutcome, inboxLabel } from "#core/feed.ts";
import { hasTabbedInbox, profilePartition } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { findTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import { createNetwork } from "#platform/network.ts";
import { createPower } from "#platform/power.ts";
import type { createSessions } from "#platform/sessions.ts";

import type { createDoNotDisturb } from "../do-not-disturb.ts";
import { createInboxTypes } from "../inbox-types.ts";
import { createMailPoller } from "../mail.ts";
import type { Profiles } from "../profiles.ts";

/**
 * Gmail's feed for each profile, polled as the profiles, the network and
 * sleep allow, with what it learns of each profile's inbox tabs.
 */
export const wireMailFeed = ({
  apps,
  sessions,
  profiles,
  doNotDisturb,
}: {
  apps: readonly App[];
  sessions: ReturnType<typeof createSessions>;
  profiles: Profiles;
  doNotDisturb: ReturnType<typeof createDoNotDisturb>;
}) => {
  const network = createNetwork();
  const gmail = findApp(apps, "gmail");
  const gmailHome = gmail?.home ?? "";
  // The registry's Gmail, or the suite's stand-in for it.
  const gmailOrigin = gmail && new URL(gmail.home).origin;
  const feedUrl = gmailOrigin && `${gmailOrigin}${FEED_PATH}`;
  const isGmailTab = (key: TabKey) =>
    findTab(profiles.get(), key)?.app === "gmail";
  const inboxTypes = createInboxTypes({
    gmailOrigin,
    isGmailTab,
    isTabbed: (profileId) => hasTabbedInbox(profiles.get(), profileId),
    setTabbed: profiles.setTabbedInbox,
    // The badge follows at once rather than at the next poll.
    // oxlint-disable-next-line no-use-before-define -- the poller reads what this learns
    onChange: (profileId) => mail.poke(profileId),
    log: console.error,
  });
  const mail = createMailPoller({
    inboxLabel: (profileId) =>
      inboxLabel(hasTabbedInbox(profiles.get(), profileId)),
    fetchFeed: async (profileId, signal, label) => {
      if (!feedUrl) {
        return { kind: "failed", reason: "no Gmail" };
      }

      return feedOutcome(
        await sessions.get(
          profilePartition(profileId),
          label === undefined ? feedUrl : `${feedUrl}/${label}`,
          signal
        )
      );
    },
    isOnline: network.isOnline,
    log: console.error,
  });
  const pollProfiles = (current: State) => {
    mail.reconcile(current.profiles.map((profile) => profile.id));
  };

  // A removed profile's polling stops here, before its data is cleared.
  profiles.onChange(pollProfiles);
  network.onOnline(mail.pokeAll);

  const power = createPower();

  power.onResume(mail.pokeAll);
  power.onResume(doNotDisturb.resume);

  return {
    network,
    gmail,
    gmailHome,
    gmailOrigin,
    isGmailTab,
    inboxTypes,
    mail,
    pollProfiles,
    power,
  };
};
