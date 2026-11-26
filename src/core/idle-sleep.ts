import type { SleepAfter, SleepIdleTabs } from "./settings.ts";
import { inOwnWindow, isPinned, knownTabs } from "./state.ts";
import type { State, Tab } from "./state.ts";
import { tabKey } from "./tabs.ts";
import type { TabKey } from "./tabs.ts";
import { onScreen } from "./views.ts";

const MINUTE = 60_000;

/** Each choice of `sleepAfter`, in milliseconds. */
export const SLEEP_AFTER_MS: Record<SleepAfter, number> = {
  "30m": 30 * MINUTE,
  "1h": 60 * MINUTE,
  "3h": 180 * MINUTE,
  "6h": 360 * MINUTE,
};

/**
 * How soon a tab kept awake only by its sound is looked at again: no event
 * says when a page falls silent.
 */
export const SOUND_RECHECK_MS = MINUTE;

/** Whether the tab carries Sleep When Idle; anything but `true` reads as not. */
export const marksSleepWhenIdle = (tab: Tab) => tab.sleepWhenIdle === true;

/** Meet's pages that hold no call. */
const MEET_PAGES_WITHOUT_CALL = new Set(["/", "/landing"]);

/**
 * Whether the Meet tab may be in a call: on any page but Meet's home and
 * landing pages, since a call sits on more addresses than one can list, and
 * a call dropped costs more than a page kept awake. A muted call is silent,
 * so sound alone cannot keep it awake.
 */
export const inMeetCall = (tab: Pick<Tab, "app" | "url">) => {
  if (tab.app !== "meet") {
    return false;
  }

  if (!URL.canParse(tab.url)) {
    return true;
  }

  const path = new URL(tab.url).pathname.toLowerCase();

  return (
    !MEET_PAGES_WITHOUT_CALL.has(path) &&
    !MEET_PAGES_WITHOUT_CALL.has(path.replace(/\/$/u, ""))
  );
};

/**
 * Whether the tab can carry Sleep When Idle: never Gmail's, which never
 * sleeps by itself, as in v3.
 */
export const canMarkSleepWhenIdle = (tab: Tab) => tab.app !== "gmail";

/** Whether the setting puts the tab to sleep once it is idle. */
export const coveredByIdleSleep = (tab: Tab, which: SleepIdleTabs) => {
  switch (which) {
    case "all": {
      return true;
    }
    case "unpinned": {
      return !isPinned(tab);
    }
    default: {
      return marksSleepWhenIdle(tab);
    }
  }
};

/**
 * When each tab that is not on screen was last hidden, after `state`: a tab
 * on screen or in its own window has no entry, one hidden keeps the time it
 * had, or takes `now` as it is first seen hidden, and a tab gone is dropped.
 */
export const followIdle = (
  since: ReadonlyMap<string, number>,
  state: State,
  now: number
): Map<string, number> => {
  const shown = new Set(onScreen(state).shown.map(tabKey));
  const next = new Map<string, number>();

  for (const profile of state.profiles) {
    for (const tab of knownTabs(profile)) {
      const key = tabKey({ profileId: profile.id, tabId: tab.id });

      if (!shown.has(key) && !inOwnWindow(tab)) {
        next.set(key, since.get(key) ?? now);
      }
    }
  }

  return next;
};

export interface IdleSleepInput {
  state: State;
  /** From `followIdle`. */
  idleSince: ReadonlyMap<string, number>;
  which: SleepIdleTabs;
  after: SleepAfter;
  now: number;
  /** Whether the tab has a page, so is neither asleep nor unloaded. */
  hasPage: (key: TabKey) => boolean;
  /** Whether the tab's page is playing sound. */
  audible: (key: TabKey) => boolean;
}

export interface IdleSleepPlan {
  /** The tabs to put to sleep now. */
  due: TabKey[];
  /** When to look again, or `undefined` while no tab could sleep. */
  next?: number;
}

/**
 * The tabs idle for `after` that `which` covers, and when the next one will
 * be. A tab on screen, in its own window, Gmail's, playing sound, in a Meet
 * call, or without a page is never due; one playing sound past its time is looked at again
 * after `SOUND_RECHECK_MS`.
 */
export const idleSleepPlan = ({
  state,
  idleSince,
  which,
  after,
  now,
  hasPage,
  audible,
}: IdleSleepInput): IdleSleepPlan => {
  const due: TabKey[] = [];
  let next: number | undefined;
  const lookAt = (at: number) => {
    next = next === undefined ? at : Math.min(next, at);
  };

  for (const profile of state.profiles) {
    for (const tab of knownTabs(profile)) {
      const key = { profileId: profile.id, tabId: tab.id };
      const since = idleSince.get(tabKey(key));

      if (
        since === undefined ||
        !canMarkSleepWhenIdle(tab) ||
        inMeetCall(tab) ||
        !coveredByIdleSleep(tab, which) ||
        !hasPage(key)
      ) {
        continue;
      }

      const dueAt = since + SLEEP_AFTER_MS[after];

      if (dueAt > now) {
        lookAt(dueAt);
      } else if (audible(key)) {
        lookAt(now + SOUND_RECHECK_MS);
      } else {
        due.push(key);
      }
    }
  }

  return { due, ...(next !== undefined && { next }) };
};
