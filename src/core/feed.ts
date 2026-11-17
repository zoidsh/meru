import { parse } from "txml/txml";
import type { TNode } from "txml/txml";

/** One unread message, as Gmail's Atom feed describes it. */
export interface FeedEntry {
  /** The `message_id` of the entry's link, lowercase hex, which names a message. */
  id: string;
  /** Where Gmail shows the message, as the feed gives it; not checked. */
  link: string;
  subject: string;
  /** A snippet of the message, cut short by Gmail. */
  summary: string;
  senderName: string;
  senderAddress: string;
  /** When the message arrived, in milliseconds since the epoch. */
  issued: number;
}

export interface Feed {
  /** Gmail's `fullcount`: every unread message, not only the entries listed. */
  unreadCount: number;
  entries: FeedEntry[];
}

/** What a fetch of the feed came to. */
export type FeedOutcome =
  | { kind: "feed"; feed: Feed }
  | { kind: "signedOut" }
  | { kind: "failed"; reason: string };

/** What the feed's URL answered, a redirect not followed. */
export type FeedResponse =
  | { kind: "redirect" }
  | { kind: "response"; status: number; body: string };

export const FEED_PATH = "/mail/u/0/feed/atom";

/** The label of Gmail's Primary category, as a path segment after the feed's. */
export const PRIMARY_LABEL = "^sq_ig_i_personal";

/**
 * What main runs in Gmail's page to learn its inbox type, which only the
 * page's own world can see. It is constant and never built from anything.
 */
export const INBOX_TYPE_EXPRESSION = "window.GM_INBOX_TYPE";

/**
 * Whether what the page answered is Gmail's tabbed inbox. Nothing else a page
 * says changes what is read, so a page that lies can at most narrow its own
 * profile's count to Primary.
 */
export const isSectioned = (value: unknown) => value === "SECTIONED";

/**
 * The label of the feed a profile's count, notifications and unified inbox
 * read: Primary on a tabbed inbox, which is what Gmail counts there, else
 * none, the whole inbox.
 */
export const inboxLabel = (sectioned: boolean) =>
  sectioned ? PRIMARY_LABEL : undefined;

/** Where a profile's feed stands, `unknown` until its first poll ends. */
export const MAIL_STATUSES = ["unknown", "ok", "signedOut", "failed"] as const;

export type MailStatus = (typeof MAIL_STATUSES)[number];

const isNode = (child: TNode | string): child is TNode =>
  typeof child !== "string";

const childNamed = (node: TNode | undefined, name: string) =>
  node?.children.filter(isNode).find((child) => child.tagName === name);

// txml decodes a lone surrogate's reference to a lone surrogate.
const textOf = (node: TNode | undefined) =>
  node?.children
    .filter((child) => typeof child === "string")
    .join("")
    .toWellFormed();

const parseEntry = (entry: TNode): FeedEntry | undefined => {
  const href = childNamed(entry, "link")?.attributes.href;
  const author = childNamed(entry, "author");
  const senderAddress = textOf(childNamed(author, "email"));
  const issued = Date.parse(textOf(childNamed(entry, "issued")) ?? "");
  let id: string | null | undefined;

  try {
    id = href ? new URL(href).searchParams.get("message_id") : undefined;
  } catch {
    return;
  }

  if (
    !href ||
    !id ||
    !/^[\da-f]+$/u.test(id) ||
    !senderAddress ||
    Number.isNaN(issued)
  ) {
    return;
  }

  return {
    id,
    link: href,
    subject: textOf(childNamed(entry, "title")) ?? "",
    summary: textOf(childNamed(entry, "summary")) ?? "",
    senderName: textOf(childNamed(author, "name")) ?? "",
    senderAddress,
    issued,
  };
};

/**
 * The unread count and entries of an Atom feed of Gmail's, or nothing for
 * text that is no such feed, such as the sign-in page. An entry that does
 * not parse is left out.
 */
export const parseFeed = (text: string): Feed | undefined => {
  let nodes: (TNode | string)[];

  try {
    nodes = parse(text, { decodeEntities: true });
  } catch {
    return;
  }

  const feed = nodes.filter(isNode).find((node) => node.tagName === "feed");
  const fullcount = textOf(childNamed(feed, "fullcount")) ?? "";
  const unreadCount = Number(fullcount);

  if (
    !feed ||
    !/^\d+$/u.test(fullcount) ||
    !Number.isSafeInteger(unreadCount)
  ) {
    return;
  }

  return {
    unreadCount,
    entries: feed.children
      .filter(isNode)
      .filter((child) => child.tagName === "entry")
      .map(parseEntry)
      .filter((entry) => entry !== undefined),
  };
};

const NOT_FOUND = "HTTP 404";

/**
 * Gmail answers a label it has no feed for with 404 rather than an empty
 * feed, so a label that stops existing reads as a failure.
 */
export const isNotFound = (outcome: FeedOutcome) =>
  outcome.kind === "failed" && outcome.reason === NOT_FOUND;

/** A redirect, 401 or 403 is the session signed out of Google. */
export const feedOutcome = (response: FeedResponse): FeedOutcome => {
  if (
    response.kind === "redirect" ||
    response.status === 401 ||
    response.status === 403
  ) {
    return { kind: "signedOut" };
  }

  if (response.status === 404) {
    return { kind: "failed", reason: NOT_FOUND };
  }

  if (response.status !== 200) {
    return { kind: "failed", reason: `HTTP ${response.status}` };
  }

  const feed = parseFeed(response.body);

  return feed
    ? { kind: "feed", feed }
    : { kind: "failed", reason: "not a feed" };
};
