import { describe, expect, test } from "bun:test";
import {
  diffInboxFeed,
  filterNewMailIdsByImportance,
  GMAIL_INBOX_FEED_URL,
  gmailFeedUrl,
  parseGmailMessageId,
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
