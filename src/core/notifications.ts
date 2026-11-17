import type { FeedEntry, FeedOutcome } from "./feed.ts";

/** How many message ids a profile remembers, the oldest forgotten first. */
export const SEEN_LIMIT = 500;

/** More new messages than this in one poll are told as one notification. */
export const MOST_TOLD_APART = 3;

/**
 * The ids of the messages a profile has been told of or found at its first
 * poll, oldest first; none until a poll since launch or since signing out has
 * read its feed.
 */
export type Seen = readonly string[] | undefined;

/**
 * What a poll leaves seen, and the messages in it to notify, oldest first.
 * The first feed read records what it lists and notifies nothing, a feed
 * signed out of starts over, and a failed poll changes nothing.
 */
export const takeNewMail = (
  seen: Seen,
  outcome: FeedOutcome
): { seen: Seen; fresh: FeedEntry[] } => {
  if (outcome.kind === "failed") {
    return { seen, fresh: [] };
  }

  if (outcome.kind === "signedOut") {
    return { seen: undefined, fresh: [] };
  }

  const listed = new Map(
    outcome.feed.entries.toReversed().map((entry) => [entry.id, entry])
  );
  const fresh =
    seen === undefined
      ? []
      : [...listed.values()].filter((entry) => !seen.includes(entry.id));

  return {
    // What the feed lists moves to the newest end, so it is forgotten last.
    seen: [
      ...(seen ?? []).filter((id) => !listed.has(id)),
      ...listed.keys(),
    ].slice(-SEEN_LIMIT),
    fresh,
  };
};

/** Which parts of a message a notification shows. */
export interface NotificationParts {
  sender: boolean;
  subject: boolean;
  summary: boolean;
}

/** The translated words a notification may need. */
export interface NotificationCopy {
  /** The title when the sender is left out. */
  newMessage: string;
  /** The title of the one notification for many messages. */
  newMessages: (count: number) => string;
}

export interface Notice {
  title: string;
  /** macOS shows the profile's name here. */
  subtitle?: string;
  body: string;
  /** The message's link as the feed gave it; none opens the inbox. */
  link?: string;
}

export interface NoticeOptions {
  parts: NotificationParts;
  /** Given only when there is more than one profile. */
  profileName: string | undefined;
  /** Whether the system shows a subtitle, as macOS does. */
  hasSubtitle: boolean;
  copy: NotificationCopy;
}

const withProfile = (
  title: string,
  lines: readonly string[],
  { profileName, hasSubtitle }: NoticeOptions
): Notice => {
  if (profileName === undefined) {
    return { title, body: lines.join("\n") };
  }

  return hasSubtitle
    ? { title, subtitle: profileName, body: lines.join("\n") }
    : { title, body: [profileName, ...lines].join("\n") };
};

/** What to show for a poll's new messages, oldest first. */
export const noticesFor = (
  fresh: readonly FeedEntry[],
  options: NoticeOptions
): Notice[] => {
  if (fresh.length > MOST_TOLD_APART) {
    return [withProfile(options.copy.newMessages(fresh.length), [], options)];
  }

  const { parts, copy } = options;

  return fresh.map((entry) => ({
    ...withProfile(
      parts.sender ? entry.senderName || entry.senderAddress : copy.newMessage,
      [
        parts.subject ? entry.subject : "",
        parts.summary ? entry.summary : "",
      ].filter((line) => line !== ""),
      options
    ),
    link: entry.link,
  }));
};

/** The link when it is on Gmail's origin with no credentials, else Gmail's inbox. */
export const messageUrl = (link: string | undefined, inbox: string) => {
  if (link === undefined) {
    return inbox;
  }

  try {
    const url = new URL(link);

    return url.origin === new URL(inbox).origin &&
      url.username === "" &&
      url.password === ""
      ? url.href
      : inbox;
  } catch {
    return inbox;
  }
};
