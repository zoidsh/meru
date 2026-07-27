import { describe, expect, test } from "bun:test";
import { parseGmailMessageId } from "./gmail";

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
