import { defineConfig } from "vite-plus";

import fmt from "./oxfmt.config.ts";
import lint from "./oxlint.config.ts";

// vp lint, vp fmt and vp test read this file only. The lint and format rules stay in Ultracite's own files so `ultracite fix` and the editor read the same ones.
export default defineConfig({
  fmt,
  lint,
});
