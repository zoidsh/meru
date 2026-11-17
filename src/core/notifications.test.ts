import { describe, expect, it } from "vitest";

import type { FeedEntry, FeedOutcome } from "./feed.ts";
import {
  SEEN_LIMIT,
  escapeNotificationMarkup,
  messageUrl,
  noticesFor,
  takeNewMail,
} from "./notifications.ts";
import type {
  NoticeOptions,
  NotificationParts,
  Seen,
} from "./notifications.ts";

const INBOX = "https://mail.google.com/mail/u/0";

const entry = (id: string, overrides: Partial<FeedEntry> = {}): FeedEntry => ({
  id,
  link: `${INBOX}?message_id=${id}`,
  subject: `Subject ${id}`,
  summary: `Summary ${id}`,
  senderName: `Sender ${id}`,
  senderAddress: `${id}@example.com`,
  issued: 0,
  ...overrides,
});

/** A feed listing `ids`, newest first, as Gmail lists them. */
const feed = (...ids: string[]): FeedOutcome => ({
  kind: "feed",
  feed: { unreadCount: ids.length, entries: ids.map((id) => entry(id)) },
});

const FAILED: FeedOutcome = { kind: "failed", reason: "HTTP 500" };

const SIGNED_OUT: FeedOutcome = { kind: "signedOut" };

/** Runs polls in order and gives the ids each one notified. */
const polls = (outcomes: FeedOutcome[], start?: Seen) => {
  let seen = start;

  return {
    told: outcomes.map((outcome) => {
      const taken = takeNewMail(seen, outcome);

      ({ seen } = taken);

      return taken.fresh.map((fresh) => fresh.id);
    }),
    seen: () => seen,
  };
};

describe(takeNewMail, () => {
  it("notifies nothing at the first poll, and what arrives after it once", () => {
    expect(
      polls([feed("b", "a"), feed("c", "b", "a"), feed("c", "b", "a")]).told
    ).toStrictEqual([[], ["c"], []]);
  });

  it("notifies new messages oldest first", () => {
    expect(polls([feed("a"), feed("d", "c", "b", "a")]).told).toStrictEqual([
      [],
      ["b", "c", "d"],
    ]);
  });

  it("changes nothing on a failed poll, the first included", () => {
    expect(
      polls([FAILED, feed("a"), FAILED, feed("b", "a")]).told
    ).toStrictEqual([[], [], [], ["b"]]);
  });

  it("only records at the first poll after signing out", () => {
    expect(
      polls([feed("a"), SIGNED_OUT, feed("b", "a"), feed("c", "b", "a")]).told
    ).toStrictEqual([[], [], [], ["c"]]);
  });

  it("does not notify a message again that left the feed and returned", () => {
    expect(
      polls([feed("b", "a"), feed("b"), feed("c", "b"), feed("c", "b", "a")])
        .told
    ).toStrictEqual([[], [], ["c"], []]);
  });

  it("remembers at most 500 ids, forgetting the oldest", () => {
    const ids = Array.from(
      { length: SEEN_LIMIT + 1 },
      (_, index) => `m${index}`
    );
    const run = polls([feed(), ...ids.map((id) => feed(id))]);

    expect(run.seen()).toHaveLength(SEEN_LIMIT);
    expect(run.seen()).not.toContain("m0");
    expect(run.seen()?.at(-1)).toBe(`m${SEEN_LIMIT}`);
    expect(takeNewMail(run.seen(), feed("m0")).fresh).toHaveLength(1);
  });

  it("keeps what the feed lists newest, so it is forgotten last", () => {
    const older = Array.from({ length: SEEN_LIMIT }, (_, index) => `m${index}`);

    expect(takeNewMail(older, feed("new", "m0")).seen).toStrictEqual([
      ...older.slice(2),
      "m0",
      "new",
    ]);
  });
});

const ALL: NotificationParts = { sender: true, subject: true, summary: true };

const options = (overrides: Partial<NoticeOptions> = {}): NoticeOptions => ({
  parts: ALL,
  profileName: undefined,
  hasSubtitle: true,
  copy: {
    newMessage: "New message",
    newMessages: (count) => `${count} new messages`,
  },
  ...overrides,
});

const one = (fresh: FeedEntry, overrides: Partial<NoticeOptions> = {}) =>
  noticesFor([fresh], options(overrides))[0];

describe(noticesFor, () => {
  it.each([
    [
      { sender: true, subject: true, summary: true },
      "Sender a",
      "Subject a\nSummary a",
    ],
    [{ sender: true, subject: true, summary: false }, "Sender a", "Subject a"],
    [{ sender: true, subject: false, summary: true }, "Sender a", "Summary a"],
    [{ sender: true, subject: false, summary: false }, "Sender a", ""],
    [
      { sender: false, subject: true, summary: true },
      "New message",
      "Subject a\nSummary a",
    ],
    [
      { sender: false, subject: true, summary: false },
      "New message",
      "Subject a",
    ],
    [
      { sender: false, subject: false, summary: true },
      "New message",
      "Summary a",
    ],
    [{ sender: false, subject: false, summary: false }, "New message", ""],
  ])("shows %o as %j over %j", (parts, title, body) => {
    expect(one(entry("a"), { parts })).toStrictEqual({
      title,
      body,
      link: `${INBOX}?message_id=a`,
      messageId: "a",
    });
  });

  it("titles a sender with no name by the address", () => {
    expect(one(entry("a", { senderName: "" }))?.title).toBe("a@example.com");
  });

  it("leaves out an empty subject or summary", () => {
    expect(one(entry("a", { subject: "" }))?.body).toBe("Summary a");
    expect(one(entry("a", { summary: "" }))?.body).toBe("Subject a");
  });

  it("names the profile in the subtitle where there is one", () => {
    expect(one(entry("a"), { profileName: "Work" })).toMatchObject({
      title: "Sender a",
      subtitle: "Work",
      body: "Subject a\nSummary a",
    });
  });

  it("names the profile at the start of the body elsewhere", () => {
    const notice = one(entry("a"), { profileName: "Work", hasSubtitle: false });

    expect(notice).toStrictEqual({
      title: "Sender a",
      body: "Work\nSubject a\nSummary a",
      link: `${INBOX}?message_id=a`,
      messageId: "a",
    });
    expect(
      one(entry("a"), {
        profileName: "Work",
        hasSubtitle: false,
        parts: { sender: true, subject: false, summary: false },
      })?.body
    ).toBe("Work");
  });

  it("shows up to three messages apart, oldest first", () => {
    expect(
      noticesFor([entry("a"), entry("b"), entry("c")], options()).map(
        (notice) => notice.title
      )
    ).toStrictEqual(["Sender a", "Sender b", "Sender c"]);
  });

  it("shows more than three as one, which opens the inbox", () => {
    const fresh = ["a", "b", "c", "d"].map((id) => entry(id));

    expect(noticesFor(fresh, options())).toStrictEqual([
      { title: "4 new messages", body: "" },
    ]);
    expect(noticesFor(fresh, options({ profileName: "Work" }))).toStrictEqual([
      { title: "4 new messages", subtitle: "Work", body: "" },
    ]);
    expect(
      noticesFor(fresh, options({ profileName: "Work", hasSubtitle: false }))
    ).toStrictEqual([{ title: "4 new messages", body: "Work" }]);
  });

  it("shows nothing for no new mail", () => {
    expect(noticesFor([], options())).toStrictEqual([]);
  });
});

describe(messageUrl, () => {
  it("opens a link on Gmail's origin", () => {
    expect(messageUrl(`${INBOX}?message_id=a&view=conv`, INBOX)).toBe(
      `${INBOX}?message_id=a&view=conv`
    );
  });

  it("reads a backslash as a slash, as a browser does, so the link stays on Gmail", () => {
    expect(
      messageUrl(String.raw`https://mail.google.com\@evil.example.com/`, INBOX)
    ).toBe("https://mail.google.com/@evil.example.com/");
  });

  it.each([
    undefined,
    "https://example.com/mail/u/0?message_id=a",
    "http://mail.google.com/mail/u/0",
    "https://mail.google.com.example.com/",
    "https://someone@mail.google.com/mail/u/0",
    "data:text/html,<p>mail</p>",
    "//evil.example.com/mail/u/0",
    "https://mail.google.com:8443/mail/u/0",
    `${"javascript"}:alert(1)`,
    "not a url",
  ])("opens the inbox in place of %s", (link) => {
    expect(messageUrl(link, INBOX)).toBe(INBOX);
  });
});

describe(escapeNotificationMarkup, () => {
  it("keeps markup in mail as the text it is", () => {
    expect(
      escapeNotificationMarkup(`<b>Ada</b> <ada@example.com> & "co" 'n' &amp;`)
    ).toBe(
      `&lt;b&gt;Ada&lt;/b&gt; &lt;ada@example.com&gt; &amp; "co" 'n' &amp;amp;`
    );
  });
});
