import path from "node:path";

import { defineConfig } from "vite-plus";

import { app, nodeLibrary } from "./vite.base.ts";

// A sandboxed preload cannot be an ES module, so this one is CommonJS.
export default defineConfig(
  nodeLibrary({
    entry: path.join(app, "preload/renderer/index.ts"),
    fileName: "renderer.cjs",
    format: "cjs",
    outDir: "preload",
  })
);
