import { describe, expect, it } from "vitest";

import { matchLanguage, resolveLanguage } from "./languages.ts";

const AVAILABLE = ["en", "de", "pt-BR"] as const;

const match = (...preferred: string[]) => matchLanguage(preferred, AVAILABLE);

describe(matchLanguage, () => {
  it("takes a catalog's exact tag, whatever its case", () => {
    expect(match("pt-br")).toBe("pt-BR");
  });

  it("falls back to a catalog for the same language in another region", () => {
    expect(match("de-AT")).toBe("de");
    expect(match("pt-PT")).toBe("pt-BR");
  });

  it("reads the POSIX names Linux hands over", () => {
    expect(match("de_DE.UTF-8")).toBe("de");
    expect(match("de_CH@euro")).toBe("de");
  });

  it("keeps the user's first choice over a closer match further down", () => {
    expect(match("de-AT", "en-US")).toBe("de");
    expect(match("fr-FR", "pt-BR", "de")).toBe("pt-BR");
  });

  it("falls back to the first catalog when no preferred tag has one", () => {
    expect(match("fr-FR", "ja")).toBe("en");
    expect(match()).toBe("en");
    expect(match("")).toBe("en");
  });
});

describe(resolveLanguage, () => {
  it("shows English for a system language Meru has no catalog for", () => {
    expect(resolveLanguage(["fr-FR"])).toBe("en");
    expect(resolveLanguage(["en-GB"])).toBe("en");
  });
});
