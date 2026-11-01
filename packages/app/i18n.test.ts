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
  activateLocale: async (tag: string) => (tag === "de" || tag === "en-XA" ? tag : "en"),
}));

mock.module("electron", () => ({
  app: { getPreferredSystemLanguages: () => preferredSystemLanguages },
}));

mock.module("@/config", () => ({
  config: { get: () => language },
}));

const logError = mock();

mock.module("@/lib/log", () => ({
  log: { error: logError },
}));

const { appI18n, gmailCatalogLoaders } = await import("./i18n");

const { getPreloadCatalog } = await import("@meru/preload-gmail/i18n");

const { SHIPPED_CATALOG_TAGS } = await import("@meru/shared/i18n/tags");

describe("gmailCatalogLoaders", () => {
  // English is the one the preload bundles itself.
  test("has a catalog for every shipped tag but English", () => {
    for (const tag of SHIPPED_CATALOG_TAGS.filter((shippedTag) => shippedTag !== "en")) {
      expect(gmailCatalogLoaders[tag], tag).toBeDefined();
    }
  });
});

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

  test("keeps the language activated at startup after a change in Settings", async () => {
    language = "de";

    await appI18n.init();

    language = "en";

    expect(appI18n.locale).toBe("de");
  });

  test("is the system language resolved at startup", async () => {
    preferredSystemLanguages = ["de"];

    await appI18n.init();

    preferredSystemLanguages = ["fr"];

    expect(appI18n.locale).toBe("de");
  });

  test("is the tag activated, English for one without a catalog", async () => {
    language = "fr";

    await appI18n.init();

    expect(appI18n.locale).toBe("en");
  });

  test("is the pseudo-locale over the chosen language when asked for in a build that carries it", async () => {
    language = "de";

    process.env.MERU_PSEUDO_LOCALE_CATALOG = "1";

    process.env.MERU_PSEUDO_LOCALE = "1";

    await appI18n.init();

    expect(appI18n.locale).toBe("en-XA");
  });

  test("ignores a request for the pseudo-locale in a build without it", async () => {
    language = "de";

    process.env.MERU_PSEUDO_LOCALE = "1";

    await appI18n.init();

    expect(appI18n.locale).toBe("de");
  });
});

describe("appI18n.gmailPreloadArguments", () => {
  beforeEach(() => {
    preferredSystemLanguages = [];

    delete process.env.MERU_PSEUDO_LOCALE;
  });

  test("hand the Gmail preload its German catalog in a German start", async () => {
    language = "de";

    await appI18n.init();

    const { messages } = await import("@meru/preload-gmail/locales/de");

    expect(getPreloadCatalog(["electron", ...appI18n.gmailPreloadArguments])).toEqual({
      locale: "de",
      messages,
    });
  });

  test("are none in an English start, whose catalog the preload carries itself", async () => {
    language = "en";

    await appI18n.init();

    expect(appI18n.gmailPreloadArguments).toEqual([]);
  });

  test("are none, and the failure logged, when the Gmail catalog fails to load", async () => {
    language = "de";

    const loadGermanCatalog = gmailCatalogLoaders.de;

    gmailCatalogLoaders.de = () => Promise.reject(new Error("The chunk failed to load"));

    try {
      await appI18n.init();
    } finally {
      gmailCatalogLoaders.de = loadGermanCatalog;
    }

    expect(appI18n.locale).toBe("de");

    expect(appI18n.gmailPreloadArguments).toEqual([]);

    expect(logError).toHaveBeenCalledTimes(1);
  });
});
