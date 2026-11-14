import type { FeedEntry } from "../records/feed.ts";
import { isSignIn } from "./links.ts";

/** The mailbox of the session's first signed-in account, the one a profile's Gmail pane shows; its feed, its messages and its actions hang off it. */
export const GMAIL_URL = "https://mail.google.com/mail/u/0";

export const INBOX_FEED_URL = `${GMAIL_URL}/feed/atom`;

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
/** The mailbox's feed's address for one read, `label` narrowing it to that label's unread mail. */
export const feedUrl = (
  gmailUrl: string,
  now: number,
  label?: string
): string =>
  `${gmailUrl}/feed/atom${label === undefined ? "" : `/${label}`}?t=${now}`;

const ORIGIN = /^(?<origin>[a-z][\w+.-]*:\/\/[^/?#]+)/iu;

const originOf = (url: string) =>
  ORIGIN.exec(url)?.groups?.origin?.toLowerCase();

/** What a redirect of a read of the feed at `from` means: Google sends a session it will not serve to accounts.google.com, where it signs in; a move within the feed's own origin, such as to another signed-in account's `/mail/u/1`, is followed; anything else is a failure, not a sign-out. */
export const redirectOf = (
  from: string,
  location: string
): "signIn" | "follow" | "elsewhere" => {
  if (isSignIn(location)) {
    return "signIn";
  }
  const target = originOf(location);
  if (target === undefined) {
    return /^\/(?!\/)/u.test(location) ? "follow" : "elsewhere";
  }
  return target === originOf(from) ? "follow" : "elsewhere";
};

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
