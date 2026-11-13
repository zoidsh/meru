import path from "node:path";

import { defineConfig } from "vite-plus";

import fmt from "./oxfmt.config.ts";
import lint from "./oxlint.config.ts";
import { app, root } from "./vite.base.ts";

const tests = path.relative(root, app);

// vp lint, vp fmt and vp test read this file only. The lint and format rules stay in Ultracite's own files so `ultracite fix` and the editor read the same ones.
export default defineConfig({
  fmt,
  lint,
  test: {
    projects: [
      {
        test: {
          environment: "node",
          include: [
            `${tests}/{core,shared,main}/**/*.test.ts`,
            "packages/user-data/**/*.test.ts",
            "packaging/*.test.ts",
            "scripts/**/*.test.ts",
          ],
          name: "node",
        },
      },
      {
        test: {
          environment: "happy-dom",
          include: [`${tests}/{preload,renderer}/**/*.test.{ts,tsx}`],
          name: "dom",
        },
      },
    ],
  },
});
