import { defineConfig } from "vite-plus";

import { preloadLibrary } from "./vite.base.ts";

export default defineConfig(preloadLibrary("gmail"));
