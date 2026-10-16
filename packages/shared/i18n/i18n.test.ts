import { describe, expect, test } from "bun:test";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { activateLocale, i18n, resolveLocale } from ".";

/*
 * Spike: the ids the macro generates are hashes of the source message and its
 * context, so a test asserts against the same hash rather than the macro, which
 * only exists at build time.
 */
const TRIAL_DAYS_LEFT =
  "{daysLeft, plural, one {# day left in your trial} other {# days left in your trial}}";

function translate(message: string, values?: Record<string, unknown>, context?: string) {
  return i18n._(generateMessageId(message, context), values);
}

describe("catalogs", () => {
  test("translates a menu label and a dialog message", () => {
    activateLocale("de");

    expect(translate("Settings")).toBe("Einstellungen");
    expect(translate("Restart Meru to apply the changes.")).toBe(
      "Starte Meru neu, um die Änderungen zu übernehmen.",
    );
    expect(translate("Restart", undefined, "button")).toBe("Neu starten");
  });

  test("keeps placeholders across a reordered translation", () => {
    activateLocale("pl");

    expect(
      translate("Open {appLabel} links in this {targetLabel}?", {
        appLabel: "Google Calendar",
        targetLabel: "tab",
      }),
    ).toBe("Otworzyć linki Google Calendar w tym elemencie: tab?");
  });

  test("selects the German plural categories", () => {
    activateLocale("de");

    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 1 })).toBe("1 Tag in deiner Testphase übrig");
    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 7 })).toBe("7 Tage in deiner Testphase übrig");
  });

  test("selects the Polish plural categories", () => {
    activateLocale("pl");

    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 1 })).toBe("Został 1 dzień okresu próbnego");
    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 3 })).toBe("Zostały 3 dni okresu próbnego");
    expect(translate(TRIAL_DAYS_LEFT, { daysLeft: 7 })).toBe("Zostało 7 dni okresu próbnego");
  });

  test("falls back to English for an unshipped language", () => {
    expect(resolveLocale(["es-MX", "fr-FR"])).toBe("en");
    expect(resolveLocale(["de-AT", "en-GB"])).toBe("de");
  });
});
