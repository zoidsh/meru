import { describe, expect, it } from "vitest";

import { firstLanguage, showLanguage } from "./document.ts";
import { i18n } from "./index.ts";

describe(firstLanguage, () => {
  it("takes the language main names in the URL", () => {
    expect(firstLanguage("?lang=en")).toBe("en");
  });

  it("takes the nearest language there is for one this build lacks, or none named", () => {
    expect([firstLanguage("?lang=en-GB"), firstLanguage("")]).toStrictEqual([
      "en",
      "en",
    ]);
  });
});

describe(showLanguage, () => {
  it("shows the strings in the language and marks the document with it", () => {
    const root = { lang: "" };

    showLanguage(root, "en");

    expect([i18n.locale, root.lang]).toStrictEqual(["en", "en"]);
  });

  it("refuses a language with no catalog, leaving the document as it was", () => {
    const root = { lang: "en" };

    expect(() => {
      showLanguage(root, "xx");
    }).toThrow("xx");
    expect([i18n.locale, root.lang]).toStrictEqual(["en", "en"]);
  });
});
