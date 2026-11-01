import { defineConfig } from "@lingui/cli";
import config from "./lingui.config";
import { PSEUDO_LOCALE } from "./packages/shared/i18n/tags";

/*
 * Compiles the pseudo-locale alone, out of the source catalog. Kept apart from
 * `lingui.config.ts` so that extraction never writes a catalog for it and every
 * catalog check, Lingui's and Meru's, sees only the languages that ship.
 */
export default defineConfig({
  ...config,
  // Lingui reads only the catalogs of listed locales, so without English the
  // pseudo-locale would have no messages to transform. Its English output is
  // the same file `lingui.config.ts` compiles.
  locales: [config.sourceLocale ?? "en", PSEUDO_LOCALE],
  pseudoLocale: {
    locale: PSEUDO_LOCALE,
    prepend: "[",
    append: "]",
    extend: 0.4,
    // Spaces alone would collapse to one in rendered text and pad nothing, and
    // an unbroken run could never wrap, so the padding is groups a line can
    // break between, as real words are.
    extendCharacter: "~~~ ",
  },
});
