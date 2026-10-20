/*
 * Kept apart from the runtime in `index.ts`, which imports the compiled
 * catalogs, so `lingui.config.ts` can read the shipped list before any catalog
 * is compiled.
 */

/** Every catalog Meru has a translation for, English included as the source. */
export const CATALOG_TAGS = [
  "en",
  "de",
  "fr",
  "it",
  "es",
  "es-419",
  "pt-BR",
  "nl",
  "pl",
  "sv",
  "ja",
] as const;

export type CatalogTag = (typeof CATALOG_TAGS)[number];

/**
 * The catalogs this build ships, which is what the picker offers, what the
 * system languages are matched against and what Lingui extracts and compiles.
 */
export const SHIPPED_CATALOG_TAGS: readonly CatalogTag[] = ["en"];
