import { beforeEach, describe, expect, mock, test } from "bun:test";

let language = "system";

let preferredSystemLanguages: string[] = [];

/*
 * The catalogs here are faked, so the tests don't depend on what this build
 * ships: German and French ship, and only German has a catalog.
 */
mock.module("@meru/shared/i18n", () => ({
  SHIPPED_CATALOG_TAGS: ["en", "de", "fr"],
  PSEUDO_LOCALE: "en-XA",
  resolveLocale: (languages: string[]) => languages[0] ?? "en",
  activateLocale: (tag: string) => (tag === "de" || tag === "en-XA" ? tag : "en"),
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

    delete process.env.MERU_PSEUDO_LOCALE_CATALOG;

    delete process.env.MERU_PSEUDO_LOCALE;
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

  test("is the pseudo-locale over the chosen language when asked for in a build that carries it", () => {
    language = "de";

    process.env.MERU_PSEUDO_LOCALE_CATALOG = "1";

    process.env.MERU_PSEUDO_LOCALE = "1";

    appI18n.init();

    expect(appI18n.locale).toBe("en-XA");
  });

  test("ignores a request for the pseudo-locale in a build without it", () => {
    language = "de";

    process.env.MERU_PSEUDO_LOCALE = "1";

    appI18n.init();

    expect(appI18n.locale).toBe("de");
  });
});
