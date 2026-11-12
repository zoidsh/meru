import path from "node:path";

import { defineConfig } from "vite-plus";

import { app, nodeLibrary } from "./vite.base.ts";

export default defineConfig(
  nodeLibrary({
    entry: path.join(app, "main/index.ts"),
    fileName: "index.js",
    format: "es",
    outDir: "main",
  })
);
