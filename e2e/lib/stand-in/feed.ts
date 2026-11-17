import type { IncomingMessage } from "node:http";

/** Where Meru reads the unread mail of a Gmail session. */
export const FEED_PATH = "/mail/u/0/feed/atom";

/** Where Meru reads the unread mail Gmail marks as important. */
export const IMPORTANT_FEED_PATH = `${FEED_PATH}/^iim`;

/** Where Meru reads the unread mail in a tabbed inbox's Primary. */
export const PRIMARY_FEED_PATH = `${FEED_PATH}/^sq_ig_i_personal`;

/** The cookie that tells the feed whose mail to answer with. */
export const ACCOUNT_COOKIE = "account";

/** A session with no account cookie, which the feed answers alike. */
export const ANY_SESSION = "";

/** An unread message the feed lists. */
export interface StandInMail {
  id: string;
  subject: string;
  summary: string;
  senderName: string;
  senderAddress: string;
  /** When it arrived, as the feed writes it; 17 November 2026, 09:00 UTC when not given. */
  issued?: string;
}

export const message = (
  id: string,
  summary = `Summary ${id}`
): StandInMail => ({
  id,
  subject: `Subject ${id}`,
  summary,
  senderName: `Sender ${id}`,
  senderAddress: `sender${id}@example.com`,
});

/** The feed lists these messages, newest first, as all that is unread. */
export const listing = (...ids: string[]) => ({
  unreadCount: ids.length,
  mail: ids.map((id) => message(id)),
});

/**
 * What the feed answers an account with: a count and the messages it lists,
 * newest first, or sign-in. The Important feed lists those of the messages
 * whose ids `important` names, none when it names none. The Primary feed
 * lists those `primary` names, and is not found, as Gmail answers a label it
 * has no feed for, when it names none.
 */
export type FeedAnswer =
  | {
      unreadCount: number;
      mail?: StandInMail[];
      important?: string[];
      primary?: string[];
    }
  | { redirect: true };

export const DEFAULT_MAIL: StandInMail[] = [
  {
    id: "1",
    subject: "Stand-in & mail",
    summary: "Nothing to read",
    senderName: "Stand-in",
    senderAddress: "stand-in@example.com",
  },
];

/** Where the stand-in's feed says a message is, by its id as Gmail's link has it. */
export const messageLink = (gmailUrl: string, id: string) =>
  `${gmailUrl}?view=conv&message_id=${id}`;

const escapeXml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const feed = (
  unreadCount: number,
  mail: StandInMail[],
  gmailUrl: string
) => `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
<title>Gmail - Inbox for stand-in@example.com</title>
<fullcount>${unreadCount}</fullcount>
${mail
  .map(
    (entry) => `<entry>
<title>${escapeXml(entry.subject)}</title>
<summary>${escapeXml(entry.summary)}</summary>
<link rel="alternate" href="${escapeXml(messageLink(gmailUrl, entry.id))}" type="text/html" />
<issued>${entry.issued ?? "2026-11-17T09:00:00Z"}</issued>
<author><name>${escapeXml(entry.senderName)}</name><email>${escapeXml(entry.senderAddress)}</email></author>
</entry>`
  )
  .join("\n")}
</feed>`;

export const accountOf = (request: IncomingMessage) =>
  (request.headers.cookie ?? "")
    .split("; ")
    .find((cookie) => cookie.startsWith(`${ACCOUNT_COOKIE}=`))
    ?.slice(ACCOUNT_COOKIE.length + 1);
