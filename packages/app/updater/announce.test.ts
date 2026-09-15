import { describe, expect, test } from "bun:test";
import { shouldAnnounceUpdate } from "./announce";

describe("shouldAnnounceUpdate", () => {
  test("announces a version nothing has been announced before", () => {
    expect(shouldAnnounceUpdate(null, "3.62.0")).toBe(true);
  });

  test("stays quiet when the same version is offered again", () => {
    expect(shouldAnnounceUpdate("3.62.0", "3.62.0")).toBe(false);
  });

  test("announces a version that follows an announced one", () => {
    expect(shouldAnnounceUpdate("3.62.0", "3.63.0")).toBe(true);
    expect(shouldAnnounceUpdate("3.62.0", "3.62.1")).toBe(true);
    expect(shouldAnnounceUpdate("3.62.0-beta.1", "3.62.0")).toBe(true);
  });
});
