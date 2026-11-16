import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

import { LANGUAGES } from "./src/i18n/languages.ts";

export default defineConfig({
  sourceLocale: "en",
  locales: [...LANGUAGES],
  catalogs: [
    {
      path: "<rootDir>/src/i18n/locales/{locale}",
      include: ["<rootDir>/src"],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
    },
  ],
  format: formatter({ lineNumbers: false }),
});
