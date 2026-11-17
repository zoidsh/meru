import { withTimeout } from "es-toolkit";

import { INBOX_TYPE_EXPRESSION, isSectioned } from "#core/feed.ts";
import type { TabKey } from "#core/tabs.ts";

import type { LoadedPage } from "./tab-views.ts";

/** How long a page may take to answer before its answer is not waited for. */
export const INBOX_TYPE_TIMEOUT = 5000;

export interface InboxTypesDeps {
  /** Gmail's origin, or the suite's stand-in's; none when there is no Gmail. */
  gmailOrigin: string | undefined;
  isGmailTab: (key: TabKey) => boolean;
  isTabbed: (profileId: string) => boolean;
  /** Saves the profile's inbox type; false when nothing was written. */
  setTabbed: (profileId: string, tabbed: boolean) => Promise<boolean>;
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

const readInboxType = async (page: LoadedPage) => {
  try {
    const answer = await withTimeout(
      () => page.evaluate(INBOX_TYPE_EXPRESSION),
      INBOX_TYPE_TIMEOUT
    );

    if (typeof answer === "string") {
      return answer;
    }
  } catch {
    // A page that throws or is too busy to answer says nothing.
  }
};

/**
 * Learns from each load of a profile's Gmail page whether its inbox is
 * tabbed, by the one constant expression Gmail's own world answers, and
 * saves it with the profile, so a profile whose page has not loaded this run
 * reads the right feed. Only a string answers: an error page, another of
 * Gmail's apps or a busy renderer leaves what was known, since each change
 * starts the notifications afresh. Only Gmail's tabbed inbox counts, so a
 * page can never make main read more than its own profile's inbox, and at
 * worst narrows its count to Primary.
 */
export const createInboxTypes = ({
  gmailOrigin,
  isGmailTab,
  isTabbed,
  setTabbed,
  onChange,
  log,
}: InboxTypesDeps) => ({
  /** Told of each tab's finished load. */
  loaded: async (key: TabKey, page: LoadedPage) => {
    if (
      gmailOrigin === undefined ||
      !isGmailTab(key) ||
      originOf(page.url()) !== gmailOrigin
    ) {
      return;
    }

    const answer = await readInboxType(page);

    if (answer === undefined) {
      return;
    }

    const tabbed = isSectioned(answer);

    if (isTabbed(key.profileId) === tabbed) {
      return;
    }

    try {
      if (!(await setTabbed(key.profileId, tabbed))) {
        return;
      }
    } catch (error) {
      log(
        `The inbox type of profile ${key.profileId} was not saved: ${error instanceof Error ? error.message : String(error)}`
      );

      return;
    }

    log(
      `Gmail's inbox in profile ${key.profileId} is ${tabbed ? "tabbed, so Primary is read" : "not tabbed, so the whole inbox is read"}`
    );
    onChange(key.profileId);
  },
});
