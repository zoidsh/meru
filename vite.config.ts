import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.join(import.meta.dirname, "src", "shell"),
  plugins: [react(), tailwindcss()],
  build: {
    // Chromium preloads modules natively.
    modulePreload: { polyfill: false },
  },
});
