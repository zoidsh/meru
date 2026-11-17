import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedOutcome } from "#core/feed.ts";

import {
  FETCH_TIMEOUT,
  MAX_BACKOFF,
  POKE_THROTTLE,
  POLL_INTERVAL,
  SIGNED_OUT_INTERVAL,
  createMailPoller,
} from "./mail.ts";

const feed = (unreadCount: number): FeedOutcome => ({
  kind: "feed",
  feed: {
    unreadCount,
    entries: [
      {
        id: "m1",
        link: "https://mail.google.com/mail/u/0?message_id=m1",
        subject: "Hello",
        summary: "",
        senderName: "Ada",
        senderAddress: "ada@example.com",
        issued: 0,
      },
    ],
  },
});

const FAILED: FeedOutcome = { kind: "failed", reason: "HTTP 500" };

interface Fetch {
  profileId: string;
  signal: AbortSignal;
  resolve: (outcome: FeedOutcome) => void;
  reject: (error: Error) => void;
}

/** A feed that answers each fetch only when the test says. */
const setup = () => {
  const fetches: Fetch[] = [];
  const logs: string[] = [];
  let online = true;
  const poller = createMailPoller({
    fetchFeed: (profileId, signal) => {
      const { promise, resolve, reject } = Promise.withResolvers<FeedOutcome>();

      fetches.push({ profileId, signal, resolve, reject });
      signal.addEventListener("abort", () => {
        reject(signal.reason as Error);
      });

      return promise;
    },
    isOnline: () => online,
    log: (message) => logs.push(message),
  });
  const changes = vi.fn<() => void>();

  poller.onChange(changes);

  /** Answers the latest fetch of the profile and lets the poller hear it. */
  const answer = async (profileId: string, outcome: FeedOutcome) => {
    const pending = fetches.findLast((made) => made.profileId === profileId);

    pending?.resolve(outcome);
    await vi.advanceTimersByTimeAsync(0);
  };

  const fetchesOf = (profileId: string) =>
    fetches.filter((made) => made.profileId === profileId).length;

  return {
    poller,
    fetches,
    logs,
    changes,
    answer,
    fetchesOf,
    goOffline: () => {
      online = false;
    },
    goOnline: () => {
      online = true;
    },
  };
};

describe(createMailPoller, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls every profile at the start, then 30 s after each poll ends", async () => {
    const { poller, answer, fetchesOf } = setup();

    poller.reconcile(["a", "b"]);

    expect([fetchesOf("a"), fetchesOf("b")]).toStrictEqual([1, 1]);

    await vi.advanceTimersByTimeAsync(10_000);
    await answer("a", feed(1));
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL - 1);

    expect(fetchesOf("a")).toBe(1);

    await vi.advanceTimersByTimeAsync(1);

    expect(fetchesOf("a")).toBe(2);
    // Still waiting on its first poll, so no second.
    expect(fetchesOf("b")).toBe(1);
  });

  it("knows no count until the first poll ends", () => {
    const { poller } = setup();

    poller.reconcile(["a"]);

    expect(poller.mail("a")).toStrictEqual({
      status: "unknown",
      unreadCount: null,
    });
  });

  it("holds the count of an answered feed and tells only of a change", async () => {
    const { poller, answer, changes } = setup();

    poller.reconcile(["a"]);

    await answer("a", feed(3));

    expect(poller.mail("a")).toStrictEqual({ status: "ok", unreadCount: 3 });
    expect(poller.entries("a").map((entry) => entry.id)).toStrictEqual(["m1"]);
    expect(changes).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    await answer("a", feed(3));

    expect(changes).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    await answer("a", feed(4));

    expect(changes).toHaveBeenCalledTimes(2);
  });

  it("keeps the count through a failure and clears it once signed out", async () => {
    const { poller, answer } = setup();

    poller.reconcile(["a"]);
    await answer("a", feed(3));
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    await answer("a", FAILED);

    expect(poller.mail("a")).toStrictEqual({
      status: "failed",
      unreadCount: 3,
    });

    poller.poke("a");
    await vi.advanceTimersByTimeAsync(POKE_THROTTLE);
    await answer("a", { kind: "signedOut" });

    expect(poller.mail("a")).toStrictEqual({
      status: "signedOut",
      unreadCount: null,
    });
    expect(poller.entries("a")).toStrictEqual([]);
  });

  it("backs off from failures, 30 s doubling to 5 min, and resets on success", async () => {
    const { poller, answer, fetchesOf } = setup();
    const gaps: number[] = [];

    poller.reconcile(["a"]);

    for (let index = 0; index < 6; index += 1) {
      const before = fetchesOf("a");
      let waited = 0;

      // oxlint-disable-next-line no-await-in-loop -- each failure in turn
      await answer("a", FAILED);

      while (fetchesOf("a") === before) {
        // oxlint-disable-next-line no-await-in-loop -- the clock moves in turn
        await vi.advanceTimersByTimeAsync(1000);
        waited += 1000;
      }

      gaps.push(waited);
    }

    expect(gaps).toStrictEqual([
      30_000,
      60_000,
      120_000,
      240_000,
      MAX_BACKOFF,
      MAX_BACKOFF,
    ]);

    await answer("a", feed(1));
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);

    expect(fetchesOf("a")).toBe(8);
  });

  it("counts a fetch that rejects or takes over 15 s as failed", async () => {
    const { poller, fetches, fetchesOf } = setup();

    poller.reconcile(["a"]);
    fetches[0]?.reject(new Error("net::ERR_CONNECTION_RESET"));
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.mail("a").status).toBe("failed");

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);

    expect(fetchesOf("a")).toBe(2);

    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT);

    expect(fetches[1]?.signal.aborted).toBeTruthy();
    expect(poller.mail("a").status).toBe("failed");
  });

  it("polls every 5 min while signed out", async () => {
    const { poller, answer, fetchesOf } = setup();

    poller.reconcile(["a"]);
    await answer("a", { kind: "signedOut" });
    await vi.advanceTimersByTimeAsync(SIGNED_OUT_INTERVAL - 1);

    expect(fetchesOf("a")).toBe(1);

    await vi.advanceTimersByTimeAsync(1);

    expect(fetchesOf("a")).toBe(2);
  });

  it("polls on a poke no sooner than 5 s after the last poll ended, a burst as one", async () => {
    const { poller, answer, fetchesOf } = setup();

    poller.reconcile(["a"]);
    await answer("a", feed(1));

    for (let index = 0; index < 5; index += 1) {
      poller.poke("a");
      // oxlint-disable-next-line no-await-in-loop -- the clock moves in turn
      await vi.advanceTimersByTimeAsync(100);
    }

    await vi.advanceTimersByTimeAsync(POKE_THROTTLE - 501);

    expect(fetchesOf("a")).toBe(1);

    await vi.advanceTimersByTimeAsync(1);

    expect(fetchesOf("a")).toBe(2);

    // The poll a poke made counts as the last: the next is 30 s after it.
    await answer("a", feed(1));
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL - 1);

    expect(fetchesOf("a")).toBe(2);
  });

  it("polls at once on a poke long after the last poll", async () => {
    const { poller, answer, fetchesOf } = setup();

    poller.reconcile(["a"]);
    await answer("a", feed(1));
    await vi.advanceTimersByTimeAsync(POKE_THROTTLE);
    poller.poke("a");
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchesOf("a")).toBe(2);
  });

  it("costs a poll every 5 s at most while the title keeps changing", async () => {
    const { poller, answer, fetchesOf } = setup();

    poller.reconcile(["a"]);
    await answer("a", feed(1));

    for (let tick = 0; tick < 40; tick += 1) {
      poller.poke("a");
      // oxlint-disable-next-line no-await-in-loop -- the clock moves in turn
      await vi.advanceTimersByTimeAsync(500);
      // oxlint-disable-next-line no-await-in-loop -- each answer in turn
      await answer("a", feed(1));
    }

    // 20 s of pokes: the launch poll and one every 5 s.
    expect(fetchesOf("a")).toBe(5);
  });

  it("never polls a profile twice at once, and polls once more after a poke in flight", async () => {
    const { poller, answer, fetchesOf } = setup();

    poller.reconcile(["a"]);
    poller.poke("a");
    poller.poke("a");
    await vi.advanceTimersByTimeAsync(POKE_THROTTLE);

    expect(fetchesOf("a")).toBe(1);

    await answer("a", feed(1));
    await vi.advanceTimersByTimeAsync(POKE_THROTTLE);

    expect(fetchesOf("a")).toBe(2);

    await answer("a", feed(2));
    await vi.advanceTimersByTimeAsync(POKE_THROTTLE);

    expect(fetchesOf("a")).toBe(2);
    expect(poller.mail("a").unreadCount).toBe(2);
  });

  it("pokes every profile at once", async () => {
    const { poller, answer, fetchesOf } = setup();

    poller.reconcile(["a", "b"]);
    await answer("a", feed(1));
    await answer("b", feed(1));
    poller.pokeAll();
    await vi.advanceTimersByTimeAsync(POKE_THROTTLE);

    expect([fetchesOf("a"), fetchesOf("b")]).toStrictEqual([2, 2]);
  });

  it("skips a poll due while offline and polls on the next timer once back, with no poke", async () => {
    const { poller, answer, fetchesOf, goOffline, goOnline } = setup();

    poller.reconcile(["a"]);
    await answer("a", feed(1));
    goOffline();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    poller.poke("a");
    await vi.advanceTimersByTimeAsync(POKE_THROTTLE);

    expect(fetchesOf("a")).toBe(1);

    goOnline();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);

    expect(fetchesOf("a")).toBe(2);
  });

  it("polls at once when poked as the network returns", async () => {
    const { poller, answer, fetchesOf, goOffline, goOnline } = setup();

    poller.reconcile(["a"]);
    await answer("a", feed(1));
    goOffline();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    goOnline();
    poller.pokeAll();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchesOf("a")).toBe(2);
  });

  it("stops a removed profile's polling, aborts its poll and drops its result", async () => {
    const { poller, fetches, fetchesOf, changes } = setup();

    poller.reconcile(["a"]);
    poller.reconcile([]);

    expect(fetches[0]?.signal.aborted).toBeTruthy();

    fetches[0]?.resolve(feed(9));
    poller.poke("a");
    await vi.advanceTimersByTimeAsync(SIGNED_OUT_INTERVAL * 2);

    expect(fetchesOf("a")).toBe(1);
    expect(poller.mail("a")).toStrictEqual({
      status: "unknown",
      unreadCount: null,
    });
    expect(changes).toHaveBeenCalledOnce();
  });

  it("tells each poll's outcome as it ends, failures included, but none of a removed profile", async () => {
    const { poller, answer } = setup();
    const polls: [string, FeedOutcome][] = [];

    poller.onPoll((profileId, outcome) => polls.push([profileId, outcome]));
    poller.reconcile(["a", "b"]);
    await answer("a", feed(1));
    await answer("b", FAILED);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL);
    poller.reconcile(["b"]);
    await answer("a", feed(2));

    expect(polls).toStrictEqual([
      ["a", feed(1)],
      ["b", FAILED],
    ]);
  });

  it("logs the status and count, never what a message says", async () => {
    const { poller, answer, logs } = setup();

    poller.reconcile(["a"]);
    await answer("a", feed(2));

    expect(logs).toStrictEqual(["Mail of profile a: ok, 2 unread"]);
    expect(logs.join("\n")).not.toMatch(/Hello|Ada|example\.com/u);
  });
});
