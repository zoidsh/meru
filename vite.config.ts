import path from "node:path";

import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.join(import.meta.dirname, "src", "shell"),
  plugins: [react(), lingui({ macroTransform: true }), tailwindcss()],
  build: {
    // Chromium preloads modules natively.
    modulePreload: { polyfill: false },
  },
});
