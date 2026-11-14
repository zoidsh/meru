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
  /** The mailbox the feed is read from, which a run from the repository may point at a stand-in. */
  readonly gmailUrl: string;
}

interface ProfileFeed {
  memory: FeedMemory;
  failures: number;
  /** What the run of failures under way is down to; undefined while the feed reads. */
  cause: string | undefined;
  reading: boolean;
  timer: Unsubscribe | undefined;
  feed: Feed;
}

type Fetched =
  | { readonly kind: "feed"; readonly feed: Feed }
  | {
      readonly kind: "failed";
      readonly cause: string;
      readonly error?: unknown;
    };

/** Google answers a session it will not let read the feed with a 401, or a redirect into its sign-in; the feed is only served over HTTPS, so no one else can answer with a redirect. */
const SIGNED_OUT = "signedOut";

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
          cause: undefined,
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
    const readAt = clock.now();
    feed.reading = true;
    const read = await this.#fetch(profileId);
    feed.reading = false;
    // A profile removed while its read was out has nothing left to tell.
    if (this.#feeds.get(profileId) !== feed) {
      return;
    }
    if (read.kind === "feed") {
      this.#take(profileId, feed, read.feed, readAt);
    } else {
      this.#fail(profileId, feed, read);
    }
    feed.timer = clock.schedule(feedDelay(feed.failures), () => {
      void this.#read(profileId);
    });
  }

  #take(profileId: string, feed: ProfileFeed, read: Feed, readAt: number) {
    const { events, log, profiles } = this.#options;
    if (feed.cause !== undefined) {
      log.info("The inbox feed reads again", {
        failures: feed.failures,
        profileId,
      });
    }
    feed.cause = undefined;
    feed.failures = 0;
    const { arrived, memory } = readFeed(feed.memory, read.entries, readAt);
    feed.memory = memory;
    profiles.setStatus(profileId, { kind: "ok", unreadCount: read.unread });
    if (!isEqual(feed.feed, read)) {
      feed.feed = read;
      this.#publish();
    }
    if (arrived.length > 0) {
      events.emit("mail.arrived", { entries: arrived, profileId });
    }
  }

  #fail(
    profileId: string,
    feed: ProfileFeed,
    failed: Extract<Fetched, { kind: "failed" }>
  ) {
    const { log, profiles } = this.#options;
    if (failed.cause === SIGNED_OUT) {
      profiles.setStatus(profileId, { kind: "needsSignIn" });
    }
    // A run of failures repeats its line every backoff, so a line is written only when the run starts or its cause changes.
    if (failed.cause !== feed.cause) {
      const fields = {
        cause: failed.cause,
        profileId,
        ...(failed.error === undefined ? {} : { error: failed.error }),
      };
      if (failed.cause === SIGNED_OUT) {
        log.info("The profile has to sign in to read its feed", fields);
      } else {
        log.warn("The inbox feed could not be read", fields);
      }
    }
    feed.cause = failed.cause;
    feed.failures += 1;
  }

  async #fetch(profileId: string, label?: string): Promise<Fetched> {
    const { clock, sessions } = this.#options;
    let response;
    try {
      response = await sessions.fetchText(
        partitionOf(profileId),
        feedUrl(this.#options.gmailUrl, clock.now(), label),
        FEED_TIMEOUT
      );
    } catch (error) {
      return { cause: "network", error, kind: "failed" };
    }
    if (
      response.kind === "redirected" ||
      (response.kind === "answered" && response.status === 401)
    ) {
      return { cause: SIGNED_OUT, kind: "failed" };
    }
    if (response.kind === "tooLarge") {
      return { cause: "tooLarge", kind: "failed" };
    }
    if (response.status !== 200) {
      return { cause: `status ${response.status}`, kind: "failed" };
    }
    const parsed = parseFeed(response.text);
    return parsed.ok
      ? { feed: parsed.value, kind: "feed" }
      : { cause: parsed.error, kind: "failed" };
  }

  #publish(): void {
    this.#options.events.emit("inbox.changed", null);
  }
}
