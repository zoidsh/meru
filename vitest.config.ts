import { lingui } from "@lingui/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [lingui({ macroTransform: true })],
  test: {
    // Activates English before any test, as main does before it starts.
    setupFiles: ["src/i18n/index.ts"],
  },
});
