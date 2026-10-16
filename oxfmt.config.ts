import oxfmtConfig from "@timche/oxc-configs/oxfmt";
import { defineConfig } from "oxfmt";

export default defineConfig({
  ...oxfmtConfig,
  // `lingui compile` writes these, one long line each.
  ignorePatterns: ["packages/shared/i18n/locales/*.ts"],
  sortTailwindcss: {
    ...oxfmtConfig.sortTailwindcss,
    stylesheet: "packages/ui/styles/globals.css",
  },
});
