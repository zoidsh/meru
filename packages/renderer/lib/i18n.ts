import { activateLocale, type CatalogTag, isCatalogTag } from "@meru/shared/i18n";
import { ipc } from "@meru/shared/renderer/ipc";
import { setDayjsLocale } from "./date";
import { localeSearchParam } from "./search-params";

function activate(locale: CatalogTag) {
  // Ahead of Lingui, whose activation re-renders, so dates redraw in the new
  // language too.
  setDayjsLocale(locale);

  activateLocale(locale);

  // Japanese needs it to pick Japanese glyphs over Chinese ones for the
  // characters the two scripts share.
  document.documentElement.lang = locale;
}

/**
 * Only main can read the preferred system languages, so it resolves the locale
 * and hands it over in the page's search parameters, the way the theme and the
 * other first-paint values already travel. A page therefore renders translated
 * without an IPC round trip, and `"system"` never has to be resolved here.
 */
export function initLocale() {
  activate(localeSearchParam && isCatalogTag(localeSearchParam) ? localeSearchParam : "en");
}

/*
 * A change reaches the pages that are already open from here rather than from
 * the `config.configChanged` push, which carries `"app.language"` as it is
 * stored and so may carry `"system"`.
 */
ipc.renderer.on("i18n.localeChanged", (_event, locale) => {
  activate(locale);
});
