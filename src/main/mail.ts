import { debounce } from "es-toolkit";

import type { FeedEntry, FeedOutcome, MailStatus } from "#core/feed.ts";

/** What the shell is told of a profile's mail. */
export interface Mail {
  status: MailStatus;
  /** The last count read; none until one is, and none once signed out. */
  unreadCount: number | null;
}

export interface MailPollerDeps {
  /** Reads the profile's feed; rejects on a network error or an abort. */
  fetchFeed: (profileId: string, signal: AbortSignal) => Promise<FeedOutcome>;
  isOnline: () => boolean;
  log: (message: string) => void;
}

export const POLL_INTERVAL = 30_000;
export const MAX_BACKOFF = 5 * 60_000;
export const SIGNED_OUT_INTERVAL = 5 * 60_000;
export const FETCH_TIMEOUT = 15_000;
/** How long pokes gather before they poll, so a burst is one poll. */
export const POKE_WAIT = 1000;

interface Polled extends Mail {
  entries: readonly FeedEntry[];
  failures: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  inFlight: AbortController | undefined;
  /** Poked while a poll was in flight: poll once more as it ends. */
  again: boolean;
  poke: ReturnType<typeof debounce<() => void>>;
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
 * down while signed out. While offline nothing is polled; `pokeAll` when the
 * network returns picks up from there. Only a status and a count are logged,
 * never what a message says or who sent it.
 */
export const createMailPoller = ({
  fetchFeed,
  isOnline,
  log,
}: MailPollerDeps) => {
  const polls = new Map<string, Polled>();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const settle = (profileId: string, polled: Polled, outcome: FeedOutcome) => {
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

  const poll = async (profileId: string, polled: Polled) => {
    if (polled.inFlight) {
      polled.again = true;

      return;
    }

    clearTimeout(polled.timer);
    polled.timer = undefined;

    if (!isOnline()) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error("timed out"));
    }, FETCH_TIMEOUT);
    let outcome: FeedOutcome;

    polled.inFlight = controller;

    try {
      outcome = await fetchFeed(profileId, controller.signal);
    } catch (error) {
      outcome = { kind: "failed", reason: describe(error) };
    } finally {
      clearTimeout(timeout);
      polled.inFlight = undefined;
    }

    // Removed while the poll was in flight.
    if (polls.get(profileId) !== polled) {
      return;
    }

    settle(profileId, polled, outcome);

    if (polled.again) {
      polled.again = false;
      poll(profileId, polled);

      return;
    }

    polled.timer = setTimeout(() => {
      poll(profileId, polled);
    }, nextDelay(polled));
  };

  const start = (profileId: string) => {
    const polled: Polled = {
      ...NO_MAIL,
      entries: [],
      failures: 0,
      timer: undefined,
      inFlight: undefined,
      again: false,
      poke: debounce(() => {
        poll(profileId, polled);
      }, POKE_WAIT),
    };

    polls.set(profileId, polled);
    poll(profileId, polled);
  };

  const stop = (profileId: string, polled: Polled) => {
    polls.delete(profileId);
    clearTimeout(polled.timer);
    polled.poke.cancel();
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
    /** Polls soon, gathering a burst into one poll, or once more after the one in flight. */
    poke: (profileId: string) => {
      polls.get(profileId)?.poke();
    },
    pokeAll: () => {
      for (const polled of polls.values()) {
        polled.poke();
      }
    },
    mail: (profileId: string): Mail => {
      const polled = polls.get(profileId);

      return polled
        ? { status: polled.status, unreadCount: polled.unreadCount }
        : NO_MAIL;
    },
    /** The unread messages the last feed listed, for the features built on it. */
    entries: (profileId: string): readonly FeedEntry[] =>
      polls.get(profileId)?.entries ?? [],
    /** Called when a profile's status or count changes. */
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type MailPoller = ReturnType<typeof createMailPoller>;
