import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";
import { createSwcExtractor } from "@lingui/native-tools";
import { SHIPPED_CATALOG_TAGS } from "./packages/shared/i18n/tags";

export default defineConfig({
  sourceLocale: "en",
  locales: [...SHIPPED_CATALOG_TAGS],
  // Lingui would otherwise fall back along CLDR parents, so a future `es-AR` or
  // `pt-PT` would borrow from `es` or `pt`. Meru resolves its own aliases and
  // keeps `es` and `es-419` apart.
  fallbackLocales: false,
  // The Gmail preload bundles a catalog of its own, so a Gmail view loads only
  // its own handful of messages rather than the whole app's.
  catalogs: [
    {
      path: "<rootDir>/packages/shared/i18n/locales/{locale}",
      include: ["<rootDir>/packages"],
      exclude: [
        "**/node_modules/**",
        "**/*.test.ts",
        "**/*.e2e.ts",
        "**/i18n/locales/**",
        "<rootDir>/packages/preload-gmail/**",
      ],
    },
    {
      path: "<rootDir>/packages/preload-gmail/locales/{locale}",
      include: ["<rootDir>/packages/preload-gmail"],
      exclude: ["**/node_modules/**", "**/*.test.ts", "**/*.e2e.ts"],
    },
  ],
  // `.ts` catalogs typecheck and bundle like any other module, so the main
  // bundle takes them through the same rolldown graph as the code.
  compileNamespace: "ts",
  format: formatter({ lineNumbers: false }),
  extractors: [createSwcExtractor()],
});
