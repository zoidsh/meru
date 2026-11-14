import type { FeedEntry } from "../records/feed.ts";

/** The inbox feed of the session's first signed-in account, the one a profile's Gmail pane shows. */
export const INBOX_FEED_URL = "https://mail.google.com/mail/u/0/feed/atom";

/** Gmail's Important marker as a label, which the feed takes as a path segment; probed to match `is:unread is:important in:inbox`. */
export const IMPORTANT_FEED_LABEL = "^iim";

const FEED_INTERVAL = 30_000;

/** The longest wait between reads after failures, so the feed comes back within minutes of the network or the session. */
const FEED_MAX_DELAY = 5 * 60_000;

export const FEED_TIMEOUT = 20_000;

// Gmail stamps `issued` with when the message was sent, which can trail its arrival in the inbox by the sender's clock skew or a slow relay.
/** How far before the last read a message may say it was issued and still count as new. */
export const FEED_SLACK = 5 * 60_000;

/** Doubles with each consecutive failure, so a feed that cannot be read, behind an expired cookie or during an outage, stops costing a request every interval. */
export const feedDelay = (failures: number): number =>
  Math.min(FEED_INTERVAL * 2 ** failures, FEED_MAX_DELAY);

// Google answers a repeated feed address from a cache for a while, so a message that just arrived would not show.
/** The feed's address for one read, `label` narrowing it to that label's unread mail. */
export const feedUrl = (base: string, now: number, label?: string): string =>
  `${base}${label === undefined ? "" : `/${label}`}?t=${now}`;

/** What a profile's last reads of its feed leave behind, to tell mail that arrived from mail that was already there. */
export interface FeedMemory {
  /** The entries of the last read and when it was taken; none before the first. */
  readonly last?: {
    readonly ids: ReadonlySet<string>;
    readonly readAt: number;
  };
  /** When each entry a read has listed was issued, kept only while the slack could still call it new. */
  readonly seen: ReadonlyMap<string, number>;
}

export const EMPTY_FEED_MEMORY: FeedMemory = { seen: new Map() };

/**
 * The entries of a read that arrived since the last one, oldest first, and the memory for the next. The first read only remembers.
 * Absence from the last read is not enough to call an entry new: unread mail moved back into the inbox, or marked unread on another device, is absent from it too, so an entry also has to be one no read has listed, issued no earlier than the slack before the last read.
 */
export const readFeed = (
  memory: FeedMemory,
  entries: readonly FeedEntry[],
  readAt: number
): { readonly memory: FeedMemory; readonly arrived: readonly FeedEntry[] } => {
  const { last, seen } = memory;
  const arrived =
    last === undefined
      ? []
      : entries
          .filter(
            (entry) =>
              !last.ids.has(entry.id) &&
              !seen.has(entry.id) &&
              entry.issued >= last.readAt - FEED_SLACK
          )
          .toReversed();
  const ids = new Set(entries.map((entry) => entry.id));
  // An entry issued before the slack fails the time test anyway, so forgetting it keeps the memory bounded.
  const kept = [
    ...seen,
    ...entries.map((entry) => [entry.id, entry.issued] as const),
  ].filter(([, issued]) => issued >= readAt - FEED_SLACK);
  return { arrived, memory: { last: { ids, readAt }, seen: new Map(kept) } };
};
