import { isEqual, sum } from "es-toolkit";

import { DisposableStore } from "../../../core/disposable.ts";
import { parseFeed } from "../../../core/engines/feed.ts";
import {
  EMPTY_FEED_MEMORY,
  FEED_TIMEOUT,
  feedDelay,
  feedUrl,
  IMPORTANT_FEED_LABEL,
  readFeed,
} from "../../../core/engines/inbox.ts";
import type { FeedMemory } from "../../../core/engines/inbox.ts";
import { isSignIn } from "../../../core/engines/links.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { LogPort } from "../../../core/log.ts";
import type {
  Clock,
  OnlinePort,
  PowerPort,
  SessionPort,
  Unsubscribe,
} from "../../../core/ports.ts";
import type { Feed } from "../../../core/records/feed.ts";
import { partitionOf } from "../../../core/records/profile.ts";
import type { Profiles } from "../profiles/index.ts";
import type { SettingsStore } from "../settings/index.ts";

export interface InboxOptions {
  readonly sessions: Pick<SessionPort, "fetchText">;
  readonly clock: Clock;
  readonly online: OnlinePort;
  readonly power: PowerPort;
  readonly profiles: Pick<Profiles, "state" | "isDeactivated" | "setStatus">;
  readonly settings: Pick<SettingsStore, "get">;
  readonly events: Pick<AppEvents, "on" | "emit">;
  readonly log: LogPort;
  /** The inbox feed's address, which a run from the repository may point at a stand-in. */
  readonly feedUrl: string;
}

interface ProfileFeed {
  memory: FeedMemory;
  failures: number;
  reading: boolean;
  timer: Unsubscribe | undefined;
  feed: Feed;
}

type Outcome = "read" | "failed";

/** Reads each active profile's Gmail inbox feed through its session, on an interval that backs off while it fails, and tells the profile and every page what is unread. */
export class Inbox {
  readonly #options: InboxOptions;
  readonly #disposables = new DisposableStore();
  readonly #feeds = new Map<string, ProfileFeed>();

  constructor(options: InboxOptions) {
    this.#options = options;
  }

  start(): void {
    const { events, online, power } = this.#options;
    this.#disposables.add(
      events.on("profiles.changed", () => {
        this.#follow();
      }),
      online.onChange((isOnline) => {
        if (isOnline) {
          this.readAll();
        }
      }),
      power.onResume(() => {
        this.readAll();
      }),
      () => {
        for (const feed of this.#feeds.values()) {
          feed.timer?.();
        }
        this.#feeds.clear();
      }
    );
    this.#follow();
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  /** Each followed profile's feed as its last read listed it, by profile id. */
  feeds(): Readonly<Record<string, Feed>> {
    return Object.fromEntries(
      [...this.#feeds].map(([profileId, { feed }]) => [profileId, feed])
    );
  }

  /** The profile's unread mail as its feed last listed it; none before the first read. */
  unread(profileId: string): number {
    return this.#feeds.get(profileId)?.feed.unread ?? 0;
  }

  /** The unread mail of every profile counted in the badge. */
  total(): number {
    const { settings } = this.#options;
    return sum(
      [...this.#feeds]
        .filter(([profileId]) => settings.get("inbox.countUnread", profileId))
        .map(([, { feed }]) => feed.unread)
    );
  }

  /** Reads every profile's feed now, each starting its interval again. */
  readAll(): void {
    for (const profileId of this.#feeds.keys()) {
      void this.#read(profileId);
    }
  }

  /** The ids of the profile's unread mail that Gmail marks important; undefined when that feed cannot be read. */
  async important(profileId: string): Promise<ReadonlySet<string> | undefined> {
    const read = await this.#fetch(profileId, IMPORTANT_FEED_LABEL);
    return read.kind === "feed"
      ? new Set(read.feed.entries.map((entry) => entry.id))
      : undefined;
  }

  /** Reads the feed of each profile that can be selected, and forgets each one that cannot. */
  #follow(): void {
    const { profiles } = this.#options;
    const wanted = new Set(
      profiles.state.profiles
        .filter((profile) => !profiles.isDeactivated(profile.id))
        .map((profile) => profile.id)
    );
    let forgot = false;
    for (const [profileId, feed] of this.#feeds) {
      if (!wanted.has(profileId)) {
        feed.timer?.();
        this.#feeds.delete(profileId);
        forgot = true;
      }
    }
    for (const profileId of wanted) {
      if (!this.#feeds.has(profileId)) {
        this.#feeds.set(profileId, {
          failures: 0,
          feed: { entries: [], unread: 0 },
          memory: EMPTY_FEED_MEMORY,
          reading: false,
          timer: undefined,
        });
        void this.#read(profileId);
      }
    }
    if (forgot) {
      this.#publish();
    }
  }

  async #read(profileId: string): Promise<void> {
    const { clock, online } = this.#options;
    const feed = this.#feeds.get(profileId);
    // One read at a time per profile, so two cannot both call the same mail new.
    if (feed === undefined || feed.reading) {
      return;
    }
    feed.timer?.();
    feed.timer = undefined;
    // The online event reads it again once the network is back.
    if (!online.isOnline()) {
      return;
    }
    feed.reading = true;
    const outcome = await this.#readInto(profileId, feed);
    feed.reading = false;
    if (this.#feeds.get(profileId) !== feed) {
      return;
    }
    feed.failures = outcome === "read" ? 0 : feed.failures + 1;
    feed.timer = clock.schedule(feedDelay(feed.failures), () => {
      void this.#read(profileId);
    });
  }

  async #readInto(profileId: string, feed: ProfileFeed): Promise<Outcome> {
    const { events, log, profiles } = this.#options;
    const readAt = this.#options.clock.now();
    const read = await this.#fetch(profileId);
    if (read.kind === "signedOut") {
      profiles.setStatus(profileId, { kind: "needsSignIn" });
      return "failed";
    }
    if (read.kind === "failed") {
      // Only the first failure of a run is worth a line; the rest repeat it every backoff.
      if (feed.failures === 0) {
        log.warn("The inbox feed could not be read", {
          ...read.fields,
          profileId,
        });
      }
      return "failed";
    }
    const { arrived, memory } = readFeed(
      feed.memory,
      read.feed.entries,
      readAt
    );
    feed.memory = memory;
    profiles.setStatus(profileId, {
      kind: "ok",
      unreadCount: read.feed.unread,
    });
    if (!isEqual(feed.feed, read.feed)) {
      feed.feed = read.feed;
      this.#publish();
    }
    if (arrived.length > 0) {
      events.emit("mail.arrived", { entries: arrived, profileId });
    }
    return "read";
  }

  async #fetch(
    profileId: string,
    label?: string
  ): Promise<
    | { readonly kind: "feed"; readonly feed: Feed }
    | { readonly kind: "signedOut" }
    | { readonly kind: "failed"; readonly fields: Record<string, unknown> }
  > {
    const { clock, sessions } = this.#options;
    let response;
    try {
      response = await sessions.fetchText(
        partitionOf(profileId),
        feedUrl(this.#options.feedUrl, clock.now(), label),
        FEED_TIMEOUT
      );
    } catch (error) {
      return { fields: { error }, kind: "failed" };
    }
    // A signed-out session is sent to Google's sign-in page instead of the feed.
    if (isSignIn(response.url) || response.status === 401) {
      return { kind: "signedOut" };
    }
    if (response.status !== 200) {
      return { fields: { status: response.status }, kind: "failed" };
    }
    const parsed = parseFeed(response.text);
    return parsed.ok
      ? { feed: parsed.value, kind: "feed" }
      : { fields: { reason: parsed.error }, kind: "failed" };
  }

  #publish(): void {
    this.#options.events.emit("inbox.changed", null);
  }
}
