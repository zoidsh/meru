import { describe, expect, test } from "bun:test";
import { getPreloadLocale } from "./i18n";

describe("getPreloadLocale", () => {
  test("takes a shipped tag from the argument", () => {
    expect(getPreloadLocale(["electron", "--meru-locale=de"], ["en", "de"])).toBe("de");
  });

  test("falls back to English for a tag this build doesn't ship", () => {
    expect(getPreloadLocale(["electron", "--meru-locale=de"], ["en"])).toBe("en");
  });

  test("falls back to English without the argument", () => {
    expect(getPreloadLocale(["electron", "--meru-hide-gmail-logo"], ["en", "de"])).toBe("en");
  });
});
