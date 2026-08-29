import { describe, expect, test } from "bun:test";
import { parseMeruUrl, resolveRoutableUrl } from "./deep-link";

describe("parseMeruUrl", () => {
  test("resolves the message route", () => {
    expect(parseMeruUrl("meru://someone@gmail.com/message/abc123")).toEqual({
      type: "message",
      email: "someone@gmail.com",
      messageId: "abc123",
    });
  });

  test("resolves the open route without an account", () => {
    expect(parseMeruUrl("meru://open?url=https%3A%2F%2Fmeet.google.com%2Fabc-defg-hij")).toEqual({
      type: "open",
      url: "https://meet.google.com/abc-defg-hij",
      email: undefined,
    });
  });

  test("resolves the open route addressed to an account", () => {
    expect(
      parseMeruUrl("meru://someone@gmail.com/open?url=https%3A%2F%2Fchat.google.com%2F"),
    ).toEqual({
      type: "open",
      url: "https://chat.google.com/",
      email: "someone@gmail.com",
    });
  });

  test("keeps a query string belonging to the target url", () => {
    expect(
      parseMeruUrl("meru://open?url=https%3A%2F%2Fcalendar.google.com%2F%3Fpli%3D1%26tab%3Dmc"),
    ).toEqual({
      type: "open",
      url: "https://calendar.google.com/?pli=1&tab=mc",
      email: undefined,
    });
  });

  test("returns undefined for another scheme", () => {
    expect(parseMeruUrl("https://meet.google.com/abc-defg-hij")).toBeUndefined();
    expect(parseMeruUrl("mailto:someone@gmail.com")).toBeUndefined();
  });

  test("returns undefined for an unknown route", () => {
    expect(parseMeruUrl("meru://someone@gmail.com/compose/abc123")).toBeUndefined();
    expect(parseMeruUrl("meru://")).toBeUndefined();
    expect(parseMeruUrl("meru://open")).toBeUndefined();
  });

  test("returns undefined for a route missing its argument", () => {
    expect(parseMeruUrl("meru://someone@gmail.com/message")).toBeUndefined();
    expect(parseMeruUrl("meru://someone@gmail.com/message/")).toBeUndefined();
    expect(parseMeruUrl("meru://open?url=")).toBeUndefined();
    expect(parseMeruUrl("meru://open?query=hello")).toBeUndefined();
  });

  test("requires an address on the message route", () => {
    expect(parseMeruUrl("meru://message/abc123")).toBeUndefined();
  });
});

describe("resolveRoutableUrl", () => {
  test("accepts a workspace app url", () => {
    expect(resolveRoutableUrl("https://meet.google.com/abc-defg-hij")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
    expect(resolveRoutableUrl("https://chat.google.com/u/0/")).toBe("https://chat.google.com/u/0/");
    expect(resolveRoutableUrl("https://docs.google.com/spreadsheets/d/abc123/edit")).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/edit",
    );
  });

  test("rejects a host that only carries a workspace app name in its path", () => {
    expect(resolveRoutableUrl("https://evil.com/meet.google.com/x")).toBeUndefined();
  });

  test("rejects a host that only ends in a google.com lookalike", () => {
    expect(resolveRoutableUrl("https://meet.google.com.evil.com/")).toBeUndefined();
    expect(resolveRoutableUrl("https://notgoogle.com/")).toBeUndefined();
  });

  test("rejects a google host with no workspace app", () => {
    expect(resolveRoutableUrl("https://photos.google.com/")).toBeUndefined();
  });

  test("rejects every scheme but https", () => {
    expect(resolveRoutableUrl("http://meet.google.com/abc-defg-hij")).toBeUndefined();
    expect(resolveRoutableUrl("javascript:alert(1)")).toBeUndefined();
    expect(resolveRoutableUrl("file:///etc/passwd")).toBeUndefined();
    expect(resolveRoutableUrl("meru://open?url=https%3A%2F%2Fmeet.google.com%2F")).toBeUndefined();
  });

  test("rejects a url that does not parse", () => {
    expect(resolveRoutableUrl("not a url at all")).toBeUndefined();
    expect(resolveRoutableUrl("")).toBeUndefined();
  });

  test("rejects credentials smuggled into the authority", () => {
    expect(resolveRoutableUrl("https://meet.google.com@evil.com/")).toBeUndefined();
  });
});
