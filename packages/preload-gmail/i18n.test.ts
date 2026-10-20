import { describe, expect, test } from "bun:test";
import { SHIPPED_CATALOG_TAGS } from "@meru/shared/i18n/tags";
import { catalogs, getPreloadLocale } from "./i18n";

describe("catalogs", () => {
  test("has a catalog for every shipped tag", () => {
    for (const tag of SHIPPED_CATALOG_TAGS) {
      expect(catalogs[tag]).toBeDefined();
    }
  });
});

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
