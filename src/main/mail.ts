import { isNotFound } from "#core/feed.ts";
import type { FeedEntry, FeedOutcome, MailStatus } from "#core/feed.ts";

type PollListener = (
  profileId: string,
  outcome: FeedOutcome,
  startedAt: number,
  label: string | undefined
) => void;

/** What the shell is told of a profile's mail. */
export interface Mail {
  status: MailStatus;
  /** The last count read; none until one is, and none once signed out. */
  unreadCount: number | null;
}

export interface MailPollerDeps {
  /**
   * Reads the profile's feed, or the feed of one of its labels; rejects on a
   * network error or an abort.
   */
  fetchFeed: (
    profileId: string,
    signal: AbortSignal,
    label?: string
  ) => Promise<FeedOutcome>;
  /** The label of the profile's inbox feed as it is now, none for the whole inbox. */
  inboxLabel: (profileId: string) => string | undefined;
  isOnline: () => boolean;
  log: (message: string) => void;
}

export const POLL_INTERVAL = 30_000;
export const MAX_BACKOFF = 5 * 60_000;
export const SIGNED_OUT_INTERVAL = 5 * 60_000;
export const FETCH_TIMEOUT = 15_000;
/**
 * How soon after a profile's last poll ended a poke may poll it again, so a
 * title that keeps changing costs a request every 5 s at most. The suite's
 * build waits 500 ms, so its tests do not spend their time waiting it out.
 */
export const POKE_THROTTLE = MERU_E2E_BUILD ? 500 : 5000;

interface Polled extends Mail {
  entries: readonly FeedEntry[];
  failures: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** When `timer` fires, in milliseconds since the epoch. */
  dueAt: number;
  /** When the last poll ended; a poke waits until 5 s after it. */
  lastEnded: number;
  inFlight: AbortController | undefined;
  /** Poked while a poll was in flight: poll once more as it ends. */
  again: boolean;
}

const NO_MAIL: Mail = { status: "unknown", unreadCount: null };

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const nextDelay = (polled: Polled) => {
  switch (polled.status) {
    case "failed": {
      return Math.min(POLL_INTERVAL * 2 ** (polled.failures - 1), MAX_BACKOFF);
    }
    case "signedOut": {
      return SIGNED_OUT_INTERVAL;
    }
    default: {
      return POLL_INTERVAL;
    }
  }
};

/**
 * Polls every profile's feed, one poll of a profile at a time: at the start,
 * then 30 s after each poll ends, backing off from a failure and slowing
 * down while signed out. A poll due while offline is skipped and the next
 * one scheduled as usual; `pokeAll` when the network returns only brings it
 * forward. A profile whose inbox has a label reads that label's feed, and
 * the whole inbox's for a poll the label's feed is not found. Only a status
 * and a count are logged, never what a message says or who sent it.
 */
export const createMailPoller = ({
  fetchFeed,
  inboxLabel,
  isOnline,
  log,
}: MailPollerDeps) => {
  const polls = new Map<string, Polled>();
  const listeners = new Set<() => void>();
  const pollListeners = new Set<PollListener>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const settle = (
    profileId: string,
    polled: Polled,
    outcome: FeedOutcome,
    startedAt: number,
    label: string | undefined
  ) => {
    const before: Mail = {
      status: polled.status,
      unreadCount: polled.unreadCount,
    };

    switch (outcome.kind) {
      case "feed": {
        polled.status = "ok";
        polled.unreadCount = outcome.feed.unreadCount;
        polled.entries = outcome.feed.entries;
        polled.failures = 0;
        break;
      }
      case "signedOut": {
        polled.status = "signedOut";
        polled.unreadCount = null;
        polled.entries = [];
        polled.failures = 0;
        break;
      }
      default: {
        polled.status = "failed";
        polled.failures += 1;
        break;
      }
    }

    for (const listener of pollListeners) {
      listener(profileId, outcome, startedAt, label);
    }

    if (
      before.status !== polled.status ||
      before.unreadCount !== polled.unreadCount
    ) {
      log(
        `Mail of profile ${profileId}: ${polled.status}${polled.unreadCount === null ? "" : `, ${polled.unreadCount} unread`}${outcome.kind === "failed" ? ` (${outcome.reason})` : ""}`
      );
      notify();
    }
  };

  const schedule = (profileId: string, polled: Polled, delay: number) => {
    clearTimeout(polled.timer);
    polled.dueAt = Date.now() + delay;
    polled.timer = setTimeout(() => {
      // oxlint-disable-next-line no-use-before-define -- each poll schedules the next
      poll(profileId, polled);
    }, delay);
  };

  /** Polls when 5 s have passed since the last poll ended, unless one is due sooner. */
  const poke = (profileId: string, polled: Polled) => {
    if (polled.inFlight) {
      polled.again = true;

      return;
    }

    const delay = Math.max(0, polled.lastEnded + POKE_THROTTLE - Date.now());

    if (polled.timer === undefined || Date.now() + delay < polled.dueAt) {
      schedule(profileId, polled, delay);
    }
  };

  const poll = async (profileId: string, polled: Polled) => {
    clearTimeout(polled.timer);
    polled.timer = undefined;

    if (!isOnline()) {
      schedule(profileId, polled, nextDelay(polled));

      return;
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => {
      controller.abort(new Error("timed out"));
    }, FETCH_TIMEOUT);
    let outcome: FeedOutcome;
    let label = inboxLabel(profileId);

    polled.inFlight = controller;

    try {
      outcome = await fetchFeed(profileId, controller.signal, label);

      if (label !== undefined && isNotFound(outcome)) {
        log(
          `Mail of profile ${profileId}: its inbox's label has no feed, so the whole inbox was read`
        );
        label = undefined;
        outcome = await fetchFeed(profileId, controller.signal);
      }
    } catch (error) {
      outcome = { kind: "failed", reason: describe(error) };
    } finally {
      clearTimeout(timeout);
      polled.inFlight = undefined;
      polled.lastEnded = Date.now();
    }

    // Removed while the poll was in flight.
    if (polls.get(profileId) !== polled) {
      return;
    }

    settle(profileId, polled, outcome, startedAt, label);

    schedule(profileId, polled, nextDelay(polled));

    if (polled.again) {
      polled.again = false;
      poke(profileId, polled);
    }
  };

  const start = (profileId: string) => {
    const polled: Polled = {
      ...NO_MAIL,
      entries: [],
      failures: 0,
      timer: undefined,
      dueAt: 0,
      lastEnded: Number.NEGATIVE_INFINITY,
      inFlight: undefined,
      again: false,
    };

    polls.set(profileId, polled);
    poll(profileId, polled);
  };

  const stop = (profileId: string, polled: Polled) => {
    polls.delete(profileId);
    clearTimeout(polled.timer);
    polled.inFlight?.abort(new Error("profile removed"));
  };

  return {
    /** Polls each listed profile not yet polled, and stops every other. */
    reconcile: (profileIds: readonly string[]) => {
      let removed = false;

      for (const [profileId, polled] of polls) {
        if (!profileIds.includes(profileId)) {
          stop(profileId, polled);
          removed = true;
        }
      }

      for (const profileId of profileIds) {
        if (!polls.has(profileId)) {
          start(profileId);
        }
      }

      if (removed) {
        notify();
      }
    },
    /**
     * Polls now, or 5 s after the last poll ended, or once more after the one
     * in flight, so a burst of pokes costs a poll now and at most one more.
     */
    poke: (profileId: string) => {
      const polled = polls.get(profileId);

      if (polled) {
        poke(profileId, polled);
      }
    },
    pokeAll: () => {
      for (const [profileId, polled] of polls) {
        poke(profileId, polled);
      }
    },
    mail: (profileId: string): Mail => {
      const polled = polls.get(profileId);

      return polled
        ? { status: polled.status, unreadCount: polled.unreadCount }
        : NO_MAIL;
    },
    /**
     * Reads the feed of one of a polled profile's labels within a poll's
     * time; a failure is an outcome, never a rejection.
     */
    readLabel: async (
      profileId: string,
      label: string
    ): Promise<FeedOutcome> => {
      if (!polls.has(profileId)) {
        return { kind: "failed", reason: "profile not polled" };
      }

      try {
        return await fetchFeed(
          profileId,
          AbortSignal.timeout(FETCH_TIMEOUT),
          label
        );
      } catch (error) {
        return { kind: "failed", reason: describe(error) };
      }
    },
    /** The unread messages the last feed listed, for the features built on it. */
    entries: (profileId: string): readonly FeedEntry[] =>
      polls.get(profileId)?.entries ?? [],
    /** Called when a profile's status or count changes. */
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
    /**
     * Called as each poll of a listed profile ends, with what it read, when,
     * in milliseconds since the epoch, its request started, and the label
     * whose feed it read, none for the whole inbox.
     */
    onPoll: (listener: PollListener) => {
      pollListeners.add(listener);
    },
  };
};

export type MailPoller = ReturnType<typeof createMailPoller>;
