import { describe, expect, spyOn, test } from "bun:test";
import { getPreloadCatalog } from "./i18n";
import { messages as en } from "./locales/en";

describe("getPreloadCatalog", () => {
  test("takes the catalog main passed in the argument", () => {
    const catalog = { locale: "de", messages: { a1b2c3: ["Nachricht gesendet"] } };

    expect(
      getPreloadCatalog([
        "electron",
        `--meru-locale=${encodeURIComponent(JSON.stringify(catalog))}`,
      ]),
    ).toEqual(catalog);
  });

  test("falls back to English for an argument that doesn't parse", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    expect(getPreloadCatalog(["electron", "--meru-locale=%7Bnot-json"])).toEqual({
      locale: "en",
      messages: en,
    });

    expect(consoleError).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });

  test("falls back to English without the argument", () => {
    expect(getPreloadCatalog(["electron", "--meru-hide-gmail-logo"])).toEqual({
      locale: "en",
      messages: en,
    });
  });
});
