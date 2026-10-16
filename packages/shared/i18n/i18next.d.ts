/*
 * Written once by `i18next-cli types`, then edited to name the namespace the
 * runtime actually registers: with `extract.defaultNS` disabled the generator
 * derives the namespace from the catalog's filename, which is `en`. Only
 * `resources.d.ts` beside it is regenerated, and `bun run i18n:types --ci`
 * checks that one, so this file stays as it is.
 *
 * The resources come from the generated declaration rather than from `en.json`
 * directly, because TypeScript widens a JSON module's string values to
 * `string`, which leaves i18next nothing to parse `{{placeholders}}` out of.
 */
import type Resources from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    enableSelector: false;
    /*
     * Off by default, and off means an English default beside the key turns the
     * key check off with it: `t("menu.settingz", "Settings")` typechecks and
     * renders the default, so the typo only shows up as an untranslated string
     * in every other language.
     */
    strictKeyChecks: true;
    defaultNS: "translation";
    resources: { translation: Resources["en"] };
  }
}
