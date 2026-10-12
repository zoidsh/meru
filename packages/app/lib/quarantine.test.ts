import { describe, expect, test } from "bun:test";
import { buildQuarantineAttributeValue } from "./quarantine";

describe("buildQuarantineAttributeValue", () => {
  test("marks the file as downloaded by Meru at the given time", () => {
    expect(buildQuarantineAttributeValue(new Date("2026-10-11T12:34:56.000Z"))).toBe(
      "0081;6acb8270;Meru;",
    );
  });

  test("writes the timestamp in seconds, as lowercase hex", () => {
    expect(buildQuarantineAttributeValue(new Date(0xabcdef * 1000 + 999))).toBe(
      "0081;abcdef;Meru;",
    );
  });
});
