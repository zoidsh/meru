import { beforeEach, describe, expect, mock, test } from "bun:test";

let language = "system";

let preferredSystemLanguages: string[] = [];

/*
 * Only English ships, which every resolution would land on, so the catalogs
 * here are faked: German and French ship, and only German has a catalog.
 */
mock.module("@meru/shared/i18n", () => ({
  SHIPPED_CATALOG_TAGS: ["en", "de", "fr"],
  resolveLocale: (languages: string[]) => languages[0] ?? "en",
  activateLocale: (tag: string) => (tag === "de" ? "de" : "en"),
}));

mock.module("electron", () => ({
  app: { getPreferredSystemLanguages: () => preferredSystemLanguages },
}));

mock.module("@/config", () => ({
  config: { get: () => language },
}));

const { appI18n } = await import("./i18n");

describe("appI18n.locale", () => {
  beforeEach(() => {
    language = "system";

    preferredSystemLanguages = [];
  });

  test("is English before init", () => {
    expect(appI18n.locale).toBe("en");
  });

  test("keeps the language activated at startup after a change in Settings", () => {
    language = "de";

    appI18n.init();

    language = "en";

    expect(appI18n.locale).toBe("de");
  });

  test("is the system language resolved at startup", () => {
    preferredSystemLanguages = ["de"];

    appI18n.init();

    preferredSystemLanguages = ["fr"];

    expect(appI18n.locale).toBe("de");
  });

  test("is the tag activated, English for one without a catalog", () => {
    language = "fr";

    appI18n.init();

    expect(appI18n.locale).toBe("en");
  });
});
