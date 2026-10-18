import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";
import { createSwcExtractor } from "@lingui/native-tools";
import { SHIPPED_CATALOG_TAGS } from "./packages/shared/i18n/tags";

export default defineConfig({
  sourceLocale: "en",
  locales: [...SHIPPED_CATALOG_TAGS],
  catalogs: [
    {
      path: "<rootDir>/packages/shared/i18n/locales/{locale}",
      include: ["<rootDir>/packages"],
      exclude: ["**/node_modules/**", "**/*.test.ts", "**/*.e2e.ts", "**/i18n/locales/**"],
    },
  ],
  // `.ts` catalogs typecheck and bundle like any other module, so the main
  // bundle takes them through the same rolldown graph as the code.
  compileNamespace: "ts",
  format: formatter({ lineNumbers: false, explicitIdAsDefault: false }),
  extractors: [createSwcExtractor()],
});
