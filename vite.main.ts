import path from "node:path";

import { defineConfig, mergeConfig } from "vite-plus";

import { app, nodeLibrary } from "./vite.base.ts";

export default defineConfig(
  mergeConfig(
    nodeLibrary({
      entry: path.join(app, "main/index.ts"),
      fileName: "index.js",
      format: "es",
      outDir: "main",
    }),
    // electron-updater is CommonJS and requires Node's modules; an ES module has no `require` unless Rolldown makes one with createRequire, which it does for the node platform.
    { build: { rolldownOptions: { platform: "node" } } }
  )
);
