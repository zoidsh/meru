import type { FeedEntry } from "./feed.ts";

/**
 * At most this many rows reach the shell, so ten profiles' 20 apiece and
 * more fit while nothing a feed says can grow the slice without bound.
 */
export const INBOX_ROW_CAP = 500;

/** One unread message in the unified inbox, as the shell is sent it. */
export interface InboxRow {
  profileId: string;
  messageId: string;
  senderName: string;
  senderAddress: string;
  subject: string;
  summary: string;
  issued: number;
}

/** Names one profile's message among every profile's. */
export const inboxKey = (profileId: string, messageId: string) =>
  `${profileId}/${messageId}`;

/**
 * Every profile's listed mail in one list, newest first by `issued`; a tie
 * keeps the profiles' order and then the feed's. A hidden message is left
 * out, and the list ends at `INBOX_ROW_CAP`.
 */
export const inboxRows = (
  profiles: readonly { id: string; entries: readonly FeedEntry[] }[],
  hidden: ReadonlySet<string>
): InboxRow[] =>
  profiles
    .flatMap(({ id, entries }) =>
      entries
        .filter((entry) => !hidden.has(inboxKey(id, entry.id)))
        .map((entry) => ({
          profileId: id,
          messageId: entry.id,
          senderName: entry.senderName,
          senderAddress: entry.senderAddress,
          subject: entry.subject,
          summary: entry.summary,
          issued: entry.issued,
        }))
    )
    .toSorted((a, b) => b.issued - a.issued)
    .slice(0, INBOX_ROW_CAP);

/**
 * An action the inbox started on a message: running, or done at `at` and
 * waiting for a poll that started after it to say what the feed now lists.
 */
export type PendingAction =
  | { phase: "running"; profileId: string }
  | { phase: "done"; profileId: string; at: number };

/**
 * What stays hidden once a poll of `profileId` that started at `startedAt`
 * has listed `listed`: a running action stays, a done one stays only while
 * the poll started no later than the millisecond it ended, which cannot say
 * whether the feed was read after it, and the feed still lists its message.
 * Another profile's are left as they were.
 */
export const afterPoll = (
  pending: ReadonlyMap<string, PendingAction>,
  profileId: string,
  startedAt: number,
  listed: ReadonlySet<string>
): Map<string, PendingAction> =>
  new Map(
    [...pending].filter(([key, action]) => {
      if (action.profileId !== profileId || action.phase === "running") {
        return true;
      }

      return (
        startedAt <= action.at && listed.has(key.slice(profileId.length + 1))
      );
    })
  );

/** How a row's date is written: the time today, the day this year, else the date. */
export type DateForm = "time" | "day" | "date";

export const dateForm = (issued: number, now: Date): DateForm => {
  const date = new Date(issued);

  if (date.getFullYear() !== now.getFullYear()) {
    return "date";
  }

  return date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
    ? "time"
    : "day";
};
