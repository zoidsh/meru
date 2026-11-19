import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // The shadcn CLI's components and its skill stay as written, so an update
  // diffs clean.
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    "src/ui/**/*.tsx",
    ".claude/skills/shadcn/**",
  ],
  sortTailwindcss: {
    ...ultracite.sortTailwindcss,
    stylesheet: "src/ui/styles.css",
  },
});
