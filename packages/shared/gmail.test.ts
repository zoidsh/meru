import { describe, expect, test } from "bun:test";
import { diffInboxFeedEntryIds, parseGmailMessageId } from "./gmail";

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

describe("diffInboxFeedEntryIds", () => {
  test("reports a change without new mail when there is no baseline", () => {
    expect(diffInboxFeedEntryIds(null, ["a", "b"])).toEqual({ changed: true, newIds: [] });
  });

  test("reports no change for an identical set", () => {
    expect(diffInboxFeedEntryIds(new Set(["a", "b"]), ["a", "b"])).toEqual({
      changed: false,
      newIds: [],
    });
    expect(diffInboxFeedEntryIds(new Set(["a", "b"]), ["b", "a"])).toEqual({
      changed: false,
      newIds: [],
    });
  });

  test("reports the arrival when one entry is read and one arrives", () => {
    expect(diffInboxFeedEntryIds(new Set(["a", "b"]), ["c", "b"])).toEqual({
      changed: true,
      newIds: ["c"],
    });
  });

  test("reports a change without new mail when an entry is only removed", () => {
    expect(diffInboxFeedEntryIds(new Set(["a", "b"]), ["b"])).toEqual({
      changed: true,
      newIds: [],
    });
  });

  test("returns new ids once and in feed order", () => {
    expect(diffInboxFeedEntryIds(new Set(["a"]), ["c", "b", "c", "a"])).toEqual({
      changed: true,
      newIds: ["c", "b"],
    });
  });
});
