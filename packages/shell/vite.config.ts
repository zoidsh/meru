import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  build: {
    // Chromium preloads modules natively.
    modulePreload: { polyfill: false },
  },
});
