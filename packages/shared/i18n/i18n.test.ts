import { describe, expect, test } from "bun:test";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import {
  activateLocale,
  CATALOG_NAMES,
  CATALOG_TAGS,
  type CatalogTag,
  getDayjsLocale,
  i18n,
  resolveLocale,
  SHIPPED_CATALOG_TAGS,
} from ".";

/*
 * The macro only exists at build time, so a test asks for a message by the id
 * it would have generated — a hash of the source and its context — and loads
 * its own catalogs compiled the way `lingui compile` writes them. The source
 * message goes along as the fallback, which is also what the macro emits, so a
 * catalog without the entry answers in English rather than with the hash.
 */
function translate(message: string, values?: Record<string, unknown>) {
  return i18n._(generateMessageId(message), values, { message });
}

/** `activateLocale` with a catalog made here, whatever this build compiles. */
function activateFixtureCatalog(locale: string, translations: Record<string, string>) {
  i18n.loadAndActivate({
    locale,
    messages: Object.fromEntries(
      Object.entries(translations).map(([source, translation]) => [
        generateMessageId(source),
        compileMessageOrThrow(translation),
      ]),
    ),
  });
}

const TRIAL_DAYS_LEFT =
  "{daysLeft, plural, one {# day left in your trial} other {# days left in your trial}}";

describe("resolveLocale", () => {
  const cases: [preferredLanguages: string[], tag: CatalogTag][] = [
    [["de"], "de"],
    [["es-419"], "es-419"],
    [["pt-BR"], "pt-BR"],
    [["es-ES"], "es"],
    [["es"], "es"],
    [["es-MX"], "es-419"],
    [["es-AR"], "es-419"],
    [["es-US"], "es-419"],
    [["pt-PT"], "pt-BR"],
    [["pt"], "pt-BR"],
    [["de-AT"], "de"],
    [["fr-CA"], "fr"],
    [["ja-JP"], "ja"],
    [["en-GB"], "en"],
    [["zh-CN", "ru-RU"], "en"],
    [[], "en"],
    [["c"], "en"],
    [["posix"], "en"],
    [["es-ES@euro", "es@euro", "es-ES", "es"], "es"],
    [["pt-PT@euro", "pt@euro", "pt-PT", "pt"], "pt-BR"],
    [["de-DE@euro", "de@euro", "de-DE", "de"], "de"],
    [["sr-RS@latin", "sr-RS@latin", "sr", "sr"], "en"],
    [["es-MX@euro"], "es-419"],
    // The first preferred language that matches anything wins, even where one
    // further down would have matched exactly.
    [["xx", "pt-PT", "de"], "pt-BR"],
  ];

  for (const [preferredLanguages, tag] of cases) {
    test(`matches ${JSON.stringify(preferredLanguages)} to ${tag}`, () => {
      expect(resolveLocale(preferredLanguages, CATALOG_TAGS)).toBe(tag);
    });
  }

  test("matches case-insensitively and answers in the catalog's own casing", () => {
    expect(resolveLocale(["DE-at"], CATALOG_TAGS)).toBe("de");
    expect(resolveLocale(["ES-mx"], CATALOG_TAGS)).toBe("es-419");
    expect(resolveLocale(["PT-pt"], CATALOG_TAGS)).toBe("pt-BR");
    expect(resolveLocale(["es-419"], CATALOG_TAGS)).toBe("es-419");
  });

  test("falls back to English for a language this build does not ship", () => {
    expect(resolveLocale(["de-DE", "fr-FR"], ["en"])).toBe("en");
  });

  test("names every catalog", () => {
    expect(Object.keys(CATALOG_NAMES).sort()).toEqual([...CATALOG_TAGS].sort());
  });
});

describe("getDayjsLocale", () => {
  test("takes dayjs's own tags", () => {
    expect(getDayjsLocale("es-419")).toBe("es-mx");
    expect(getDayjsLocale("pt-BR")).toBe("pt-br");
    expect(getDayjsLocale("en")).toBe("en");
    expect(getDayjsLocale("ja")).toBe("ja");
  });
});

describe("activateLocale", () => {
  // Runs before any test here activates a locale, which `--isolate` makes
  // the state the module is loaded into.
  test("has English active once the module loads", () => {
    expect(i18n.locale).toBe("en");
    expect(translate("Settings")).toBe("Settings");
  });

  test("activates the catalog this build ships", () => {
    activateLocale("en");

    expect(i18n.locale).toBe("en");
    expect(translate("Settings")).toBe("Settings");
  });

  test("has a catalog for every shipped tag", () => {
    for (const tag of SHIPPED_CATALOG_TAGS) {
      activateLocale(tag);

      expect(i18n.locale).toBe(tag);
    }
  });

  // `activateLocale` reads the compiled catalogs, not a list it is passed, so
  // the example is a tag that is never a catalog's.
  test("activates English, plural rules included, for a tag whose catalog is not in this build", () => {
    activateLocale("xx" as CatalogTag);

    expect(i18n.locale).toBe("en");
    expect(translate("Settings")).toBe("Settings");
  });
});

describe("catalogs", () => {
  test("switches the messages a translation is read from", () => {
    activateFixtureCatalog("de", { Settings: "Einstellungen" });

    expect(translate("Settings")).toBe("Einstellungen");

    activateLocale("en");

    expect(translate("Settings")).toBe("Settings");
  });

  test("keeps placeholders across a reordered translation", () => {
    activateFixtureCatalog("pl", {
      "Open {appLabel} links in this {targetLabel}?":
        "Otworzyć linki {appLabel} w tym elemencie: {targetLabel}?",
    });

    expect(
      translate("Open {appLabel} links in this {targetLabel}?", {
        appLabel: "Google Calendar",
        targetLabel: "tab",
      }),
    ).toBe("Otworzyć linki Google Calendar w tym elemencie: tab?");
  });

  test("selects the German plural categories", () => {
    activateFixtureCatalog("de", {
      [TRIAL_DAYS_LEFT]:
        "{daysLeft, plural, one {# Tag in deiner Testphase übrig} other {# Tage in deiner Testphase übrig}}",
    });

    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 1 })).toBe("1 Tag in deiner Testphase übrig");
    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 7 })).toBe("7 Tage in deiner Testphase übrig");
  });

  test("selects the Polish plural categories", () => {
    activateFixtureCatalog("pl", {
      [TRIAL_DAYS_LEFT]:
        "{daysLeft, plural, one {Został # dzień okresu próbnego} few {Zostały # dni okresu próbnego} many {Zostało # dni okresu próbnego} other {Zostało # dnia okresu próbnego}}",
    });

    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 1 })).toBe("Został 1 dzień okresu próbnego");
    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 3 })).toBe("Zostały 3 dni okresu próbnego");
    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 7 })).toBe("Zostało 7 dni okresu próbnego");
    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 1.5 })).toBe("Zostało 1,5 dnia okresu próbnego");
  });
});
