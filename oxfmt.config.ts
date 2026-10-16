import oxfmtConfig from "@timche/oxc-configs/oxfmt";
import { defineConfig } from "oxfmt";

export default defineConfig({
  ...oxfmtConfig,
  // `i18next-cli types` writes this one, and quotes every property name.
  // Reformatting it makes `i18next-cli types --ci` call it out of date.
  ignorePatterns: ["packages/shared/i18n/resources.d.ts"],
  sortTailwindcss: {
    ...oxfmtConfig.sortTailwindcss,
    stylesheet: "packages/ui/styles/globals.css",
  },
});
