import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en", "de", "pl"],
  extract: {
    input: ["packages/**/*.{ts,tsx}"],
    ignore: ["**/node_modules/**", "**/*.test.ts", "**/*.e2e.ts", "**/i18n/locales/**"],
    // One catalog per locale, so the whole app shares a single namespace and
    // nothing has to declare which one it is reading. `defaultNS: false` keeps
    // the namespace out of the file, leaving the keys at the top level.
    output: "packages/shared/i18n/locales/{{language}}.json",
    defaultNS: false,
    // An empty secondary value is what `status` counts as untranslated, so a
    // new key fails the check until a translation lands.
    defaultValue: "",
    warnOnConflicts: true,
  },
  types: {
    input: ["packages/shared/i18n/locales/en.json"],
    output: "packages/shared/i18n/i18next.d.ts",
    resourcesFile: "packages/shared/i18n/resources.d.ts",
  },
  lint: {
    ignore: ["scripts/**", "tests/**"],
    checkConcatenation: "error",
  },
});
