import { i18n, type Messages } from "@lingui/core";
import { GMAIL_PRELOAD_LOCALE_ARGUMENT } from "@meru/shared/gmail";
import { messages as en } from "./locales/en";

const LOCALE_ARGUMENT_PREFIX = `${GMAIL_PRELOAD_LOCALE_ARGUMENT}=`;

export type PreloadCatalog = { locale: string; messages: Messages };

/**
 * The catalog main passed in the argument, or English without one or for one
 * that doesn't parse.
 *
 * The preload is sandboxed and bundled into one file, so it has no chunk to
 * load a catalog from at runtime. Main loads this view's catalog for the
 * language it resolved and passes it along instead, which leaves English as the
 * only catalog in the bundle.
 */
export function getPreloadCatalog(argv: readonly string[]): PreloadCatalog {
  const value = argv
    .find((argument) => argument.startsWith(LOCALE_ARGUMENT_PREFIX))
    ?.slice(LOCALE_ARGUMENT_PREFIX.length);

  if (value) {
    // A throw here would take every Gmail feature down with the preload.
    try {
      return JSON.parse(decodeURIComponent(value)) as PreloadCatalog;
    } catch (error) {
      console.error("Failed to read the Gmail catalog; falling back to English", error);
    }
  }

  return { locale: "en", messages: en };
}

/*
 * Main resolves the language once at startup, before the first Gmail view, so
 * activating on load is all a view ever needs.
 */
i18n.loadAndActivate(getPreloadCatalog(process.argv));
