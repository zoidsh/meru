import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  sortTailwindcss: {
    ...ultracite.sortTailwindcss,
    stylesheet: "packages/shell/src/styles.css",
  },
});
