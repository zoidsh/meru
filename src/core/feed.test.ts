import { describe, expect, it } from "vitest";

import {
  PRIMARY_LABEL,
  feedOutcome,
  inboxLabel,
  isNotFound,
  isSectioned,
  parseFeed,
} from "./feed.ts";

const link = (messageId: string) =>
  `<link rel="alternate" href="https://mail.google.com/mail/u/0?account_id=me@example.com&amp;message_id=${messageId}&amp;view=conv&amp;extsrc=atom" type="text/html" />`;

/** The link `link` writes, decoded. */
const linkOf = (messageId: string) =>
  `https://mail.google.com/mail/u/0?account_id=me@example.com&message_id=${messageId}&view=conv&extsrc=atom`;

const entry = ({
  id = "19a0000000000001",
  title = "Lunch",
  summary = "Are we still on?",
  name = "Ada Lovelace",
  email = "ada@example.com",
  issued = "2026-11-17T09:30:00Z",
} = {}) => `<entry>
<title>${title}</title>
<summary>${summary}</summary>
${link(id)}
<modified>${issued}</modified>
<issued>${issued}</issued>
<id>tag:gmail.google.com,2004:${id}</id>
<author><name>${name}</name><email>${email}</email></author>
</entry>`;

const feed = (
  fullcount: string,
  entries = "",
  title = "Gmail - Inbox for me@example.com"
) => `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
<title>${title}</title>
<tagline>New messages in your Gmail Inbox</tagline>
<fullcount>${fullcount}</fullcount>
<link rel="alternate" href="https://mail.google.com/mail/u/0" type="text/html" />
<modified>2026-11-17T10:00:00Z</modified>
${entries}
</feed>`;

const subjectOf = (title: string) =>
  parseFeed(feed("1", entry({ title })))?.entries[0]?.subject;

describe(parseFeed, () => {
  it("reads the count and every entry", () => {
    expect(
      parseFeed(
        feed(
          "42",
          entry() +
            entry({
              id: "19a0000000000002",
              title: "Invoice",
              summary: "",
              name: "",
              email: "billing@example.com",
              issued: "2026-11-16T08:00:00Z",
            })
        )
      )
    ).toStrictEqual({
      unreadCount: 42,
      address: "me@example.com",
      entries: [
        {
          id: "19a0000000000001",
          link: linkOf("19a0000000000001"),
          subject: "Lunch",
          summary: "Are we still on?",
          senderName: "Ada Lovelace",
          senderAddress: "ada@example.com",
          issued: Date.parse("2026-11-17T09:30:00Z"),
        },
        {
          id: "19a0000000000002",
          link: linkOf("19a0000000000002"),
          subject: "Invoice",
          summary: "",
          senderName: "",
          senderAddress: "billing@example.com",
          issued: Date.parse("2026-11-16T08:00:00Z"),
        },
      ],
    });
  });

  it("reads a feed with nothing unread", () => {
    expect(parseFeed(feed("0"))).toStrictEqual({
      unreadCount: 0,
      address: "me@example.com",
      entries: [],
    });
  });

  it("keeps a count above the entries Gmail lists", () => {
    expect(parseFeed(feed("250", entry()))?.unreadCount).toBe(250);
  });

  it.each([
    ["Tom &amp; Jerry", "Tom & Jerry"],
    ["&lt;3 &gt; &quot;q&quot; &apos;a&apos;", "<3 > \"q\" 'a'"],
    ["It&#39;s &#x2014; done &#128512;", "It's — done 😀"],
    // One pass: what an entity decodes to is not decoded again.
    ["&amp;lt;b&amp;gt;", "&lt;b&gt;"],
    ["&nbsp;stays", "&nbsp;stays"],
    ["&#x110000;", "&#x110000;"],
    ["&#xD800;", "�"],
    ["", ""],
  ])("decodes the subject %j as %j", (title, subject) => {
    expect(subjectOf(title)).toBe(subject);
  });

  it("leaves CDATA as written", () => {
    expect(subjectOf("<![CDATA[a &amp; <b>]]>")).toBe("a &amp; <b>");
  });

  it("decodes the sender and the link before reading the message id", () => {
    const [read] =
      parseFeed(
        feed(
          "1",
          entry({ id: "abcdef", name: "Smith &amp; Sons" }).replace(
            "message_id=abcdef",
            "message_id=%61bc%64ef"
          )
        )
      )?.entries ?? [];

    expect(read?.id).toBe("abcdef");
    expect(read?.senderName).toBe("Smith & Sons");
  });

  it.each([
    ["no message id", entry().replace(/message_id=[^&]+&amp;/u, "")],
    ["a message id that is not lowercase hex", entry({ id: "19A0-not-hex" })],
    ["no link", entry().replace(/<link[^>]*>/u, "")],
    ["no sender's address", entry({ email: "" })],
    ["no date", entry({ issued: "yesterday" })],
  ])("drops an entry with %s and keeps the rest", (_case, broken) => {
    expect(
      parseFeed(feed("2", broken + entry()))?.entries.map((read) => read.id)
    ).toStrictEqual(["19a0000000000001"]);
  });

  it.each([
    [
      "a sign-in page",
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Gmail</title></head><body><form action="/signin"><input name="identifier"></form></body></html>`,
    ],
    ["a feed with no count", feed("")],
    ["a feed with a count that is no number", feed("-1")],
    ["a feed with a count past the safe integers", feed("9007199254740993")],
    ["text that is not markup", "Service Unavailable"],
    ["nothing", ""],
    ["markup that does not close", "<feed><fullcount>1</fullcount></entry>"],
  ])("refuses %s", (_case, text) => {
    expect(parseFeed(text)).toBeUndefined();
  });
});

const addressIn = (title: string) => parseFeed(feed("0", "", title))?.address;

describe("the signed-in account's address", () => {
  it("is the word holding an @ in the feed's title, whatever its language or label", () => {
    expect([
      addressIn("Gmail - Inbox for me@example.com"),
      addressIn("Gmail - Label &#39;^sq_ig_i_personal&#39; for me@example.com"),
      addressIn("Gmail - Boîte de réception de moi@exemple.fr"),
      addressIn("Gmail – 受信トレイ (me@example.co.jp)"),
    ]).toStrictEqual([
      "me@example.com",
      "me@example.com",
      "moi@exemple.fr",
      "me@example.co.jp",
    ]);
  });

  it("is nothing for a title with no address, two, or a malformed one, and the feed still reads", () => {
    const parsed = [
      "Gmail - Inbox",
      "a@b.com and c@d.com",
      "Inbox for @",
      "me@@example.com",
      "",
    ].map((title) => parseFeed(feed("2", "", title)));

    expect(
      parsed.map((read) => [read?.unreadCount, read?.address])
    ).toStrictEqual([
      [2, undefined],
      [2, undefined],
      [2, undefined],
      [2, undefined],
      [2, undefined],
    ]);
  });
});

describe(feedOutcome, () => {
  it("reads a feed", () => {
    expect(
      feedOutcome({ kind: "response", status: 200, body: feed("3") })
    ).toStrictEqual({
      kind: "feed",
      feed: { unreadCount: 3, address: "me@example.com", entries: [] },
    });
  });

  it.each([
    [{ kind: "redirect" } as const],
    [{ kind: "response", status: 401, body: "" } as const],
    [{ kind: "response", status: 403, body: "" } as const],
  ])("is signed out on %j", (response) => {
    expect(feedOutcome(response)).toStrictEqual({ kind: "signedOut" });
  });

  it.each([
    [{ kind: "response", status: 500, body: feed("3") } as const],
    [{ kind: "response", status: 200, body: "<html></html>" } as const],
  ])("fails on %j", (response) => {
    expect(feedOutcome(response).kind).toBe("failed");
  });
});

describe(isNotFound, () => {
  it("is a 404 alone", () => {
    expect(
      isNotFound(feedOutcome({ kind: "response", status: 404, body: "" }))
    ).toBeTruthy();
    expect(
      isNotFound(feedOutcome({ kind: "response", status: 500, body: "" }))
    ).toBeFalsy();
    expect(
      isNotFound(
        feedOutcome({ kind: "response", status: 200, body: feed("0") })
      )
    ).toBeFalsy();
    expect(isNotFound({ kind: "signedOut" })).toBeFalsy();
  });
});

describe(isSectioned, () => {
  it("is Gmail's tabbed inbox", () => {
    expect(isSectioned("SECTIONED")).toBeTruthy();
  });

  it.each([
    ["another type", "PRIORITY_INBOX"],
    ["another case", "sectioned"],
    ["padded", " SECTIONED"],
    ["longer", "SECTIONED_INBOX"],
    ["empty", ""],
    ["undefined", undefined],
    ["null", null],
    ["a number", 1],
    ["a boolean", true],
    ["an array holding it", ["SECTIONED"]],
    ["an object holding it", { type: "SECTIONED" }],
    ["an object that prints as it", { toString: () => "SECTIONED" }],
    ["a long string", "SECTIONED".repeat(1000)],
  ])("is not %s", (_name, value) => {
    expect(isSectioned(value)).toBeFalsy();
  });
});

describe(inboxLabel, () => {
  it("reads Primary on a tabbed inbox and the whole inbox otherwise", () => {
    expect(inboxLabel(true)).toBe(PRIMARY_LABEL);
    expect(inboxLabel(false)).toBeUndefined();
  });
});
