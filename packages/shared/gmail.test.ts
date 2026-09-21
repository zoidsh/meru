import { describe, expect, test } from "bun:test";
import {
  createGmailMessageActionRequest,
  diffInboxFeed,
  filterNewMailIdsByImportance,
  GMAIL_INBOX_FEED_URL,
  gmailFeedUrl,
  parseGmailIdKey,
  parseGmailInboxType,
  parseGmailMessageId,
  resolveGmailLiteMode,
  resolveInboxFeedUrl,
} from "./gmail";

const MESSAGE_ID = "FMfcgzQhVWzcNswCzNbqBmBjxGmZBbbV";

describe("parseGmailMessageId", () => {
  test("parses a message opened from a system label view", () => {
    expect(parseGmailMessageId(`#inbox/${MESSAGE_ID}`)).toBe(MESSAGE_ID);
    expect(parseGmailMessageId(`#all/${MESSAGE_ID}`)).toBe(MESSAGE_ID);
    expect(parseGmailMessageId(`#sent/${MESSAGE_ID}`)).toBe(MESSAGE_ID);
  });

  test("parses a message opened from search", () => {
    expect(parseGmailMessageId(`#search/meru/${MESSAGE_ID}`)).toBe(MESSAGE_ID);
  });

  test("parses a message opened from advanced search", () => {
    expect(parseGmailMessageId(`#advanced-search/from%3Dsender%40example.com/${MESSAGE_ID}`)).toBe(
      MESSAGE_ID,
    );
  });

  test("parses a message opened from a label view", () => {
    expect(parseGmailMessageId(`#label/Newsletters/${MESSAGE_ID}`)).toBe(MESSAGE_ID);
    expect(parseGmailMessageId(`#label/Work%2FProjects/${MESSAGE_ID}`)).toBe(MESSAGE_ID);
  });

  test("parses a message opened from a category view", () => {
    expect(parseGmailMessageId(`#category/social/${MESSAGE_ID}`)).toBe(MESSAGE_ID);
  });

  test("parses a message with a trailing hash query", () => {
    expect(parseGmailMessageId(`#inbox/${MESSAGE_ID}?compose=new`)).toBe(MESSAGE_ID);
    expect(parseGmailMessageId(`#search/meru/${MESSAGE_ID}?compose=new`)).toBe(MESSAGE_ID);
  });

  test("parses a hash without a leading number sign", () => {
    expect(parseGmailMessageId(`inbox/${MESSAGE_ID}`)).toBe(MESSAGE_ID);
  });

  test("returns null for message list views", () => {
    expect(parseGmailMessageId("#inbox")).toBeNull();
    expect(parseGmailMessageId("#search/meru")).toBeNull();
    expect(parseGmailMessageId("#label/Newsletters")).toBeNull();
    expect(parseGmailMessageId("#category/social")).toBeNull();
  });

  test("returns null for a list view named like a message id", () => {
    expect(parseGmailMessageId("#label/SomeLongLabelName123")).toBeNull();
    expect(parseGmailMessageId("#search/somelongsearchterm")).toBeNull();
  });

  test("returns null for paginated message list views", () => {
    expect(parseGmailMessageId("#inbox/p2")).toBeNull();
    expect(parseGmailMessageId("#search/meru/p2")).toBeNull();
  });

  test("returns null for settings views", () => {
    expect(parseGmailMessageId("#settings/general")).toBeNull();
  });

  test("returns null for an empty hash", () => {
    expect(parseGmailMessageId("")).toBeNull();
    expect(parseGmailMessageId("#")).toBeNull();
  });
});

const READ_AT = 1_700_000_000_000;

const SLACK = 60_000;

function entries(...ids: string[]) {
  return ids.map((id) => ({ id, receivedAt: READ_AT }));
}

describe("diffInboxFeed", () => {
  test("reports a change without new mail when there is no baseline", () => {
    expect(diffInboxFeed(null, new Set(), entries("a", "b"), SLACK)).toEqual({
      changed: true,
      newIds: [],
    });
  });

  test("reports no change for an identical set", () => {
    const previous = { ids: new Set(["a", "b"]), readAt: READ_AT };

    expect(diffInboxFeed(previous, new Set(), entries("a", "b"), SLACK)).toEqual({
      changed: false,
      newIds: [],
    });
    expect(diffInboxFeed(previous, new Set(), entries("b", "a"), SLACK)).toEqual({
      changed: false,
      newIds: [],
    });
  });

  test("reports the arrival when one entry is read and one arrives", () => {
    expect(
      diffInboxFeed(
        { ids: new Set(["a", "b"]), readAt: READ_AT },
        new Set(),
        entries("c", "b"),
        SLACK,
      ),
    ).toEqual({ changed: true, newIds: ["c"] });
  });

  test("reports a change without new mail when an entry is only removed", () => {
    expect(
      diffInboxFeed({ ids: new Set(["a", "b"]), readAt: READ_AT }, new Set(), entries("b"), SLACK),
    ).toEqual({ changed: true, newIds: [] });
  });

  test("returns new ids once and in feed order", () => {
    expect(
      diffInboxFeed(
        { ids: new Set(["a"]), readAt: READ_AT },
        new Set(),
        entries("c", "b", "c", "a"),
        SLACK,
      ),
    ).toEqual({ changed: true, newIds: ["c", "b"] });
  });

  test("reports a change without new mail for an entry this session already listed", () => {
    expect(
      diffInboxFeed(
        { ids: new Set(["a"]), readAt: READ_AT },
        new Set(["c"]),
        entries("c", "a"),
        SLACK,
      ),
    ).toEqual({ changed: true, newIds: [] });
  });

  test("reports a change without new mail for an entry received before the slack window", () => {
    expect(
      diffInboxFeed(
        { ids: new Set(["a"]), readAt: READ_AT },
        new Set(),
        [
          { id: "c", receivedAt: READ_AT - SLACK - 1 },
          { id: "a", receivedAt: READ_AT },
        ],
        SLACK,
      ),
    ).toEqual({ changed: true, newIds: [] });
  });

  test("reports the arrival for an entry received inside the slack window", () => {
    expect(
      diffInboxFeed(
        { ids: new Set(["a"]), readAt: READ_AT },
        new Set(),
        [
          { id: "c", receivedAt: READ_AT - SLACK },
          { id: "a", receivedAt: READ_AT },
        ],
        SLACK,
      ),
    ).toEqual({ changed: true, newIds: ["c"] });
    expect(
      diffInboxFeed(
        { ids: new Set(["a"]), readAt: READ_AT },
        new Set(),
        [
          { id: "c", receivedAt: READ_AT - SLACK + 1 },
          { id: "a", receivedAt: READ_AT },
        ],
        SLACK,
      ),
    ).toEqual({ changed: true, newIds: ["c"] });
  });

  test("reports the arrival for an entry received after the feed was last read", () => {
    expect(
      diffInboxFeed(
        { ids: new Set(["a"]), readAt: READ_AT },
        new Set(),
        [
          { id: "c", receivedAt: READ_AT + 1 },
          { id: "a", receivedAt: READ_AT },
        ],
        SLACK,
      ),
    ).toEqual({ changed: true, newIds: ["c"] });
  });
});

describe("gmailFeedUrl", () => {
  test("returns the inbox feed url without a label", () => {
    expect(gmailFeedUrl()).toBe(GMAIL_INBOX_FEED_URL);
  });

  test("appends the system label id of a label", () => {
    expect(gmailFeedUrl("primary")).toBe(`${GMAIL_INBOX_FEED_URL}/^sq_ig_i_personal`);
    expect(gmailFeedUrl("important")).toBe(`${GMAIL_INBOX_FEED_URL}/^iim`);
  });
});

describe("filterNewMailIdsByImportance", () => {
  test("keeps every id when notifying for all new emails", () => {
    expect(filterNewMailIdsByImportance(["a", "b"], "all", new Set(["a"]))).toEqual(
      new Set(["a", "b"]),
    );
    expect(filterNewMailIdsByImportance(["a", "b"], "all", new Set())).toEqual(new Set(["a", "b"]));
    expect(filterNewMailIdsByImportance(["a", "b"], "all", null)).toEqual(new Set(["a", "b"]));
  });

  test("keeps only the ids the important feed carries", () => {
    expect(filterNewMailIdsByImportance(["a", "b", "c"], "important", new Set(["b", "d"]))).toEqual(
      new Set(["b"]),
    );
  });

  test("keeps nothing when the important feed is empty", () => {
    expect(filterNewMailIdsByImportance(["a", "b"], "important", new Set())).toEqual(new Set());
  });

  test("keeps every id when the important feed could not be fetched", () => {
    expect(filterNewMailIdsByImportance(["a", "b"], "important", null)).toEqual(
      new Set(["a", "b"]),
    );
  });
});

describe("resolveInboxFeedUrl", () => {
  test("reads the Primary feed only for a sectioned inbox", () => {
    expect(resolveInboxFeedUrl("SECTIONED", "primary")).toBe(gmailFeedUrl("primary"));
  });

  test("reads the whole inbox when the inbox is not sectioned", () => {
    expect(resolveInboxFeedUrl("CLASSIC", "primary")).toBe(GMAIL_INBOX_FEED_URL);
  });

  test("reads the whole inbox when no live page has reported an inbox type", () => {
    expect(resolveInboxFeedUrl(null, "primary")).toBe(GMAIL_INBOX_FEED_URL);
  });

  test("reads the whole inbox when every category is monitored", () => {
    expect(resolveInboxFeedUrl("SECTIONED", "all")).toBe(GMAIL_INBOX_FEED_URL);
  });
});

describe("parseGmailIdKey", () => {
  test("reads the key out of the page", () => {
    expect(parseGmailIdKey("<script>var GM_ID_KEY = 'ab12cd34';</script>")).toBe("ab12cd34");
  });

  test("answers null for a page that carries no key", () => {
    expect(parseGmailIdKey("<html></html>")).toBe(null);
  });
});

describe("parseGmailInboxType", () => {
  test("reads the inbox type declared the way the mutate key is", () => {
    expect(parseGmailInboxType("<script>var GM_INBOX_TYPE = 'SECTIONED';</script>")).toBe(
      "SECTIONED",
    );
  });

  test("reads a plain or window-prefixed assignment", () => {
    expect(parseGmailInboxType('GM_INBOX_TYPE="CLASSIC"')).toBe("CLASSIC");
    expect(parseGmailInboxType("window.GM_INBOX_TYPE = 'SECTIONED'")).toBe("SECTIONED");
  });

  test("reads a JSON-ish assignment", () => {
    expect(parseGmailInboxType('{"GM_INBOX_TYPE":"PRIORITY_INBOX"}')).toBe("PRIORITY_INBOX");
  });

  test("answers null for a page that carries no inbox type", () => {
    expect(parseGmailInboxType("<html></html>")).toBe(null);
    expect(parseGmailInboxType("var GM_ID_KEY = 'ab12cd34';")).toBe(null);
  });
});

describe("createGmailMessageActionRequest", () => {
  const request = createGmailMessageActionRequest({
    messageId: MESSAGE_ID,
    action: "archive",
    idKey: "ab12cd34",
    actionToken: "at-token",
    timestamp: 1_700_000_000_000,
  });

  test("posts to the mutate endpoint with the key and the action token", () => {
    expect(request.url).toBe(
      "https://mail.google.com/mail/u/0/s/?v=or&ik=ab12cd34&at=at-token&subui=chrome&hl=en&ts=1700000000000",
    );
  });

  test("carries the action code and the message id in the payload", () => {
    expect(JSON.parse(String(request.body.get("s_jr")))).toEqual([
      null,
      [
        [null, null, null, [null, 1, MESSAGE_ID, MESSAGE_ID, "l:all", [], [], []]],
        [null, null, null, null, null, null, [null, true, false]],
        [null, null, null, null, null, null, [null, true, false]],
      ],
      2,
      null,
      null,
      null,
      "ab12cd34",
    ]);
  });

  test("carries the action code of each of the four row actions", () => {
    const actionCodeOf = (
      action: Parameters<typeof createGmailMessageActionRequest>[0]["action"],
    ) =>
      JSON.parse(
        String(
          createGmailMessageActionRequest({
            messageId: MESSAGE_ID,
            action,
            idKey: "ab12cd34",
            actionToken: "at-token",
          }).body.get("s_jr"),
        ),
      )[1][0][3][1];

    expect(actionCodeOf("archive")).toBe(1);
    expect(actionCodeOf("markAsRead")).toBe(3);
    expect(actionCodeOf("delete")).toBe(9);
    expect(actionCodeOf("markAsSpam")).toBe(7);
  });
});

describe("resolveGmailLiteMode", () => {
  test("hands back the mode the user chose under a valid license", () => {
    expect(resolveGmailLiteMode("idle", true)).toBe("idle");
    expect(resolveGmailLiteMode("startup", true)).toBe("startup");
    expect(resolveGmailLiteMode("off", true)).toBe("off");
  });

  test("reads an account written before Lite mode existed as off", () => {
    expect(resolveGmailLiteMode(undefined, true)).toBe("off");
  });

  test("gives Gmail back when the license is not valid, whatever was chosen", () => {
    expect(resolveGmailLiteMode("idle", false)).toBe("off");
    expect(resolveGmailLiteMode("startup", false)).toBe("off");
  });
});
