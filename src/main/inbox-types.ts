import { withTimeout } from "es-toolkit";

import { INBOX_TYPE_EXPRESSION, inboxLabel, isSectioned } from "#core/feed.ts";
import type { State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";

import type { LoadedPage } from "./tab-views.ts";

/** How long a page may take to answer before it counts as no tabbed inbox. */
export const INBOX_TYPE_TIMEOUT = 5000;

export interface InboxTypesDeps {
  /** Gmail's origin, or the suite's stand-in's; none when there is no Gmail. */
  gmailOrigin: string | undefined;
  isGmailTab: (key: TabKey) => boolean;
  /** Told of a profile whose inbox type changed, so its count can follow. */
  onChange: (profileId: string) => void;
  log: (message: string) => void;
}

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

/** A throw or no answer in time counts as no tabbed inbox. */
const readSectioned = async (page: LoadedPage) => {
  try {
    return isSectioned(
      await withTimeout(
        () => page.evaluate(INBOX_TYPE_EXPRESSION),
        INBOX_TYPE_TIMEOUT
      )
    );
  } catch {
    return false;
  }
};

/**
 * Learns from each load of a profile's Gmail page whether its inbox is
 * tabbed, by the one constant expression Gmail's own world answers, and
 * keeps it in memory for that profile's feed. Only Gmail's tabbed inbox
 * counts, so a page can never make main read more than its own profile's
 * inbox, and at worst narrows its count to Primary.
 */
export const createInboxTypes = ({
  gmailOrigin,
  isGmailTab,
  onChange,
  log,
}: InboxTypesDeps) => {
  const sectioned = new Map<string, boolean>();

  return {
    /** Told of each tab's finished load. */
    loaded: async (key: TabKey, page: LoadedPage) => {
      if (
        gmailOrigin === undefined ||
        !isGmailTab(key) ||
        originOf(page.url()) !== gmailOrigin
      ) {
        return;
      }

      const next = await readSectioned(page);
      const before = sectioned.get(key.profileId) ?? false;

      // Its profile may have gone while the page answered.
      if (!isGmailTab(key)) {
        return;
      }

      sectioned.set(key.profileId, next);

      if (before === next) {
        return;
      }

      log(
        `Gmail's inbox in profile ${key.profileId} is ${next ? "tabbed, so Primary is read" : "not tabbed, so the whole inbox is read"}`
      );
      onChange(key.profileId);
    },
    /** The label of the profile's inbox feed, none for the whole inbox. */
    label: (profileId: string) => inboxLabel(sectioned.get(profileId) ?? false),
    /** Forgets each profile no longer listed. */
    follow: (current: State) => {
      const listed = new Set(current.profiles.map((profile) => profile.id));

      for (const profileId of sectioned.keys()) {
        if (!listed.has(profileId)) {
          sectioned.delete(profileId);
        }
      }
    },
  };
};

export type InboxTypes = ReturnType<typeof createInboxTypes>;
