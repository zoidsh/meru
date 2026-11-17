import { lingui } from "@lingui/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [lingui({ macroTransform: true })],
  // Unit tests prove what a release does, not what the suite's build does.
  define: { MERU_E2E_BUILD: "false" },
  test: {
    // Activates English before any test, as main does before it starts.
    setupFiles: ["src/i18n/index.ts"],
  },
});
