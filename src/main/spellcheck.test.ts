import { describe, expect, it } from "vitest";

import { recordInto, silentLog } from "#core/log.fake.ts";
import { createInitialSettings } from "#core/settings.ts";
import type { SpellChecker } from "#platform/spellcheck.ts";

import { createSettingsStore } from "./settings.ts";
import { createSpellcheck } from "./spellcheck.ts";

/** Chromium's: throws on a language it has no dictionary for, setting nothing. */
const fakeChecker = ({
  system = "en-US",
  supported = ["en-US", "en-GB", "de", "fr"],
  defaults = ["en-US"],
}: { system?: string; supported?: string[]; defaults?: string[] } = {}) => {
  const languages = new Map<string, readonly string[]>();
  const checker: SpellChecker = {
    systemLanguage: () => system,
    available: () => supported,
    defaults: () => defaults,
    set: (partition, next) => {
      const missing = next.find((language) => !supported.includes(language));

      if (missing !== undefined) {
        throw new Error(`no dictionary for ${missing}`);
      }

      languages.set(partition, next);
    },
  };

  return { checker, languages };
};

const setUp = (
  chosen: string[],
  options?: Parameters<typeof fakeChecker>[0]
) => {
  const settings = createSettingsStore({
    initial: { ...createInitialSettings(), spellcheckLanguages: chosen },
    save: () => Promise.resolve(),
    platform: "linux",
    log: silentLog,
  });
  const { checker, languages } = fakeChecker(options);
  const logged: string[] = [];
  const spellcheck = createSpellcheck({
    checker,
    settings,
    log: recordInto(logged),
  });

  return { settings, spellcheck, languages, logged };
};

describe(createSpellcheck, () => {
  it("checks a profile's session in the system's language alone by default", () => {
    const { spellcheck, languages } = setUp([]);

    spellcheck.prepare("persist:a");

    expect(languages.get("persist:a")).toStrictEqual(["en-US"]);
  });

  it("adds the chosen languages after the system's, each once", () => {
    const { spellcheck, languages } = setUp(["de", "en-US", "fr"]);

    spellcheck.prepare("persist:a");

    expect(languages.get("persist:a")).toStrictEqual(["en-US", "de", "fr"]);
  });

  it("drops a chosen language with no dictionary and keeps the rest", () => {
    const { settings, spellcheck, languages, logged } = setUp(["xx", "de"]);

    spellcheck.prepare("persist:a");

    expect(languages.get("persist:a")).toStrictEqual(["en-US", "de"]);
    expect(logged).toHaveLength(1);
    expect(settings.get("spellcheckLanguages")).toStrictEqual(["xx", "de"]);
  });

  it("falls back to Chromium's own languages for a system language with no dictionary", () => {
    const { spellcheck, languages } = setUp(["de"], {
      system: "ja",
      defaults: ["en-US"],
    });

    spellcheck.prepare("persist:a");

    expect(languages.get("persist:a")).toStrictEqual(["en-US", "de"]);
  });

  it("gives every prepared session the new languages as they change, and later sessions too", async () => {
    const { settings, spellcheck, languages } = setUp([]);

    spellcheck.prepare("persist:a");
    spellcheck.prepare("persist:b");
    await settings.update("spellcheckLanguages", () => ["fr"]);

    expect(languages.get("persist:a")).toStrictEqual(["en-US", "fr"]);
    expect(languages.get("persist:b")).toStrictEqual(["en-US", "fr"]);

    spellcheck.prepare("persist:c");

    expect(languages.get("persist:c")).toStrictEqual(["en-US", "fr"]);
  });

  it("offers every language Chromium has but the system's, which is always checked", () => {
    const { spellcheck } = setUp([]);

    expect(spellcheck.read()).toStrictEqual({
      always: ["en-US"],
      system: true,
      available: ["en-GB", "de", "fr"],
    });
  });

  it("shows Chromium's own languages as always checked for a system language with no dictionary, as they are applied", () => {
    const { spellcheck, languages } = setUp([], {
      system: "ja",
      defaults: ["en-GB"],
    });

    spellcheck.prepare("persist:a");

    expect([spellcheck.read(), languages.get("persist:a")]).toStrictEqual([
      { always: ["en-GB"], system: false, available: ["en-US", "de", "fr"] },
      ["en-GB"],
    ]);
  });

  it("shows nothing always checked when Chromium chose none for a system language with no dictionary", () => {
    const { spellcheck, languages } = setUp(["de"], {
      system: "ja",
      defaults: [],
    });

    spellcheck.prepare("persist:a");

    expect([spellcheck.read(), languages.get("persist:a")]).toStrictEqual([
      { always: [], system: false, available: ["en-US", "en-GB", "de", "fr"] },
      ["de"],
    ]);
  });
});
