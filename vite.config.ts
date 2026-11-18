import path from "node:path";

import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const INSERT_CSS = "function __insertCSS(code) {";

/**
 * Sonner injects its stylesheet as an inline `<style>`, which the shell's
 * content security policy refuses with an error; the shell bundles
 * `sonner/dist/styles.css` instead, so the injection is cut out. A Sonner
 * that injects its styles another way fails the build, not the policy.
 */
const sonnerWithoutInlineStyles = (): Plugin => ({
  name: "sonner-without-inline-styles",
  enforce: "pre",
  transform(code, id) {
    if (!/[\\/]sonner[\\/]dist[\\/]index\.mjs$/u.test(id)) {
      return;
    }

    if (!code.includes(INSERT_CSS)) {
      this.error(
        "Sonner no longer injects its styles through __insertCSS; see vite.config.ts"
      );
    }

    return code.replace(INSERT_CSS, `${INSERT_CSS} return;`);
  },
});

export default defineConfig({
  root: path.join(import.meta.dirname, "src", "shell"),
  plugins: [
    sonnerWithoutInlineStyles(),
    react(),
    lingui({ macroTransform: true }),
    tailwindcss(),
  ],
  // Pre-bundled, Sonner would skip the plugin above.
  optimizeDeps: { exclude: ["sonner"] },
  build: {
    // Chromium preloads modules natively.
    modulePreload: { polyfill: false },
  },
});
