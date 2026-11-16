import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  sortTailwindcss: {
    ...ultracite.sortTailwindcss,
    stylesheet: "src/shell/styles.css",
  },
});
