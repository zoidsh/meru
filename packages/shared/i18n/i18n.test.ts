import { describe, expect, test } from "bun:test";
import { activateLocale, resolveLocale, t } from ".";

describe("catalogs", () => {
  test("translates a menu label and a dialog message", async () => {
    await activateLocale("de");

    expect(t("menu.settings")).toBe("Einstellungen");
    expect(t("dialog.restart.message")).toBe("Starte Meru neu, um die Änderungen zu übernehmen.");
    expect(t("dialog.restart.confirm")).toBe("Neu starten");
  });

  test("keeps placeholders across a reordered translation", async () => {
    await activateLocale("pl");

    expect(
      t("dialog.appLinksHandover.message", {
        appLabel: "Google Calendar",
        targetLabel: "tab",
      }),
    ).toBe("Otworzyć linki Google Calendar w tym elemencie: tab?");
  });

  test("selects the German plural categories", async () => {
    await activateLocale("de");

    expect(t("menu.trialDaysLeft", { count: 1 })).toBe("1 Tag in deiner Testphase übrig");
    expect(t("menu.trialDaysLeft", { count: 7 })).toBe("7 Tage in deiner Testphase übrig");
  });

  test("selects the Polish plural categories", async () => {
    await activateLocale("pl");

    expect(t("menu.trialDaysLeft", { count: 1 })).toBe("Został 1 dzień okresu próbnego");
    expect(t("menu.trialDaysLeft", { count: 3 })).toBe("Zostały 3 dni okresu próbnego");
    expect(t("menu.trialDaysLeft", { count: 7 })).toBe("Zostało 7 dni okresu próbnego");
  });

  test("falls back to English for an unshipped language", () => {
    expect(resolveLocale(["es-MX", "fr-FR"])).toBe("en");
    expect(resolveLocale(["de-AT", "en-GB"])).toBe("de");
  });
});
