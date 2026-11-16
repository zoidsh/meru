import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // The shadcn CLI's components stay as it writes them, so an update diffs
  // clean.
  ignorePatterns: [...ultracite.ignorePatterns, "src/ui/**/*.tsx"],
  sortTailwindcss: {
    ...ultracite.sortTailwindcss,
    stylesheet: "src/ui/styles.css",
  },
});
