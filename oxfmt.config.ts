import oxfmtConfig from "@timche/oxc-configs/oxfmt";
import { defineConfig } from "oxfmt";

export default defineConfig({
  ...oxfmtConfig,
  sortTailwindcss: {
    ...oxfmtConfig.sortTailwindcss,
    stylesheet: "packages/ui/styles/globals.css",
  },
});
