import { describe, expect, test } from "bun:test";
import en from "./locales/en.json";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, resolveLocale, resources } from "./index";

describe("resolveLocale", () => {
  test("returns the default locale for undefined input", () => {
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  test("returns the default locale for null input", () => {
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
  });

  test("returns the default locale for empty string", () => {
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
  });

  test("resolves exact match", () => {
    expect(resolveLocale("en")).toBe("en");
  });

  test("resolves with region subtag", () => {
    expect(resolveLocale("en-US")).toBe("en");
  });

  test("resolves with underscore separator", () => {
    expect(resolveLocale("en_US")).toBe("en");
  });

  test("resolves case-insensitively", () => {
    expect(resolveLocale("EN")).toBe("en");
  });

  test("falls back to default for unsupported locale", () => {
    expect(resolveLocale("xx")).toBe(DEFAULT_LOCALE);
  });
});

describe("locale metadata", () => {
  test("includes the default locale", () => {
    expect(SUPPORTED_LOCALES.some((locale) => locale.code === DEFAULT_LOCALE)).toBe(true);
  });

  test("every supported locale has a resource entry", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(resources).toHaveProperty(locale.code);
    }
  });
});

const collectKeys = (value: unknown, prefix = ""): string[] => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  const keys: string[] = [];

  for (const [name, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextPrefix = prefix ? `${prefix}.${name}` : name;
    keys.push(...collectKeys(nested, nextPrefix));
  }

  return keys;
};

describe("locale structural parity", () => {
  const baseKeys = collectKeys(en).sort();

  for (const locale of SUPPORTED_LOCALES) {
    test(`${locale.code} has the same keys as en`, () => {
      const entry = resources[locale.code];

      const localeKeys = collectKeys(entry.translation).sort();

      expect(localeKeys).toEqual(baseKeys);
    });
  }
});
