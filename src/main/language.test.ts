import { describe, expect, it } from "vitest";

import { createInitialSettings } from "#core/settings.ts";
import type { Settings } from "#core/settings.ts";

import { createLanguage } from "./language.ts";
import { createSettingsStore } from "./settings.ts";

const setUp = (initial: Settings, preferred = ["de-DE"]) => {
  const settings = createSettingsStore({
    initial,
    save: () => Promise.resolve(),
    platform: "darwin",
    log: () => {},
  });
  const activated: string[] = [];
  const changes: string[] = [];
  const system = { preferred };
  const language = createLanguage({
    settings,
    available: ["en", "de"],
    preferredLanguages: () => system.preferred,
    activate: (tag) => {
      activated.push(tag);
    },
  });

  language.onChange(() => {
    changes.push(language.current());
  });

  return { settings, language, activated, changes, system };
};

describe(createLanguage, () => {
  it("shows the system's language for an install that never chose one", () => {
    const { language, activated } = setUp(createInitialSettings());

    expect(language.current()).toBe("de");
    expect(activated).toStrictEqual(["de"]);
  });

  it("shows the chosen language over the system's", () => {
    const { language } = setUp({ ...createInitialSettings(), language: "en" });

    expect(language.current()).toBe("en");
    expect(language.system()).toBe("de");
  });

  it("reads a language this build has no catalog for as the system's", () => {
    const { language } = setUp({ ...createInitialSettings(), language: "ja" });

    expect(language.current()).toBe("de");
  });

  it("applies a change at once and tells its listeners", async () => {
    const { settings, language, activated, changes } = setUp(
      createInitialSettings()
    );

    await settings.update("language", () => "en");

    expect(language.current()).toBe("en");
    expect(activated).toStrictEqual(["de", "en"]);
    expect(changes).toStrictEqual(["en"]);

    await settings.update("language", () => "system");

    expect(changes).toStrictEqual(["en", "de"]);
  });

  it("tells no one of a change that shows the same language", async () => {
    const { settings, activated, changes } = setUp(createInitialSettings());

    await settings.update("language", () => "de");

    expect(activated).toStrictEqual(["de"]);
    expect(changes).toStrictEqual([]);
  });

  it("reads the system's languages again as System is chosen", async () => {
    const { settings, language, system } = setUp({
      ...createInitialSettings(),
      language: "de",
    });

    system.preferred = ["en-GB"];
    await settings.update("language", () => "system");

    expect(language.current()).toBe("en");
  });
});
