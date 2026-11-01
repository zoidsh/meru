import { activateLocale, isLocaleTag } from "@meru/shared/i18n";
import { setDayjsLocale } from "./date";
import { localeSearchParam } from "./search-params";

/**
 * Only main can read the preferred system languages, so it resolves the locale
 * and hands it over in the page's search parameters, the way the theme and the
 * other first-paint values already travel. A page therefore renders translated
 * without an IPC round trip, and `"system"` never has to be resolved here.
 */
export function initLocale() {
  const locale = localeSearchParam && isLocaleTag(localeSearchParam) ? localeSearchParam : "en";

  setDayjsLocale(locale);

  activateLocale(locale);

  // Japanese needs it to pick Japanese glyphs over Chinese ones for the
  // characters the two scripts share.
  document.documentElement.lang = locale;
}
