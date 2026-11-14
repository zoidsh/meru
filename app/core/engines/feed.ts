import { parseXml, XmlElement } from "@rgrove/parse-xml";

import type { Feed, FeedEntry } from "../records/feed.ts";
import { err, ok } from "../result.ts";
import type { Result } from "../result.ts";

/** Why a feed's text is not a feed: not XML, as Google's sign-in page is not, or XML of another shape. */
type FeedError = "notXml" | "notAFeed";

const children = (element: XmlElement, name: string): XmlElement[] =>
  element.children.filter(
    (child): child is XmlElement =>
      child instanceof XmlElement && child.name === name
  );

const child = (element: XmlElement, name: string): XmlElement | undefined =>
  children(element, name)[0];

const textOf = (element: XmlElement, name: string): string =>
  child(element, name)?.text.trim() ?? "";

const MESSAGE_ID = /[?&]message_id=(?<id>[\da-f]+)/u;

const entryOf = (element: XmlElement): FeedEntry | undefined => {
  const id = textOf(element, "id");
  const link = child(element, "link")?.attributes.href ?? "";
  const author = child(element, "author");
  const issued = Date.parse(textOf(element, "issued"));
  if (id === "" || author === undefined || Number.isNaN(issued)) {
    return undefined;
  }
  return {
    author: { email: textOf(author, "email"), name: textOf(author, "name") },
    id,
    issued,
    link,
    messageId: MESSAGE_ID.exec(link)?.groups?.id ?? "",
    subject: textOf(element, "title"),
    summary: textOf(element, "summary"),
  };
};

/** Gmail's Atom inbox feed read into its unread count and its entries, newest first as Gmail lists them; an entry missing its id, author or time is left out rather than failing the feed. */
export const parseFeed = (text: string): Result<Feed, FeedError> => {
  let root: XmlElement | null;
  try {
    ({ root } = parseXml(text));
  } catch {
    return err("notXml");
  }
  if (root?.name !== "feed") {
    return err("notAFeed");
  }
  const count = textOf(root, "fullcount");
  const unread = Number(count);
  if (count === "" || !Number.isInteger(unread) || unread < 0) {
    return err("notAFeed");
  }
  return ok({
    entries: children(root, "entry").flatMap((element) => {
      const entry = entryOf(element);
      return entry === undefined ? [] : [entry];
    }),
    unread,
  });
};
