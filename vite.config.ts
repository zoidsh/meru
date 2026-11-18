import path from "node:path";

import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const INSERT_CSS = "function __insertCSS(code) {";

const SONNER_MODULE =
  /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?sonner[\\/]/u;

/**
 * Sonner injects its stylesheet as an inline `<style>`, which the shell's
 * content security policy refuses with an error; the shell bundles
 * `sonner/dist/styles.css` instead, so the injection is cut out. A bundle
 * holding Sonner's code with no injection cut out fails the build, since the
 * policy would only say so at run time.
 */
const sonnerWithoutInlineStyles = (): Plugin => {
  let cut = false;

  return {
    name: "sonner-without-inline-styles",
    enforce: "pre",
    buildStart() {
      cut = false;
    },
    transform(code, id) {
      if (!SONNER_MODULE.test(id) || !code.includes(INSERT_CSS)) {
        return;
      }

      cut = true;

      return code.replace(INSERT_CSS, `${INSERT_CSS} return;`);
    },
    generateBundle(_options, bundle) {
      const sonner = Object.values(bundle).some(
        (output) =>
          output.type === "chunk" &&
          Object.keys(output.modules).some(
            (id) => SONNER_MODULE.test(id) && !id.endsWith(".css")
          )
      );

      if (sonner && !cut) {
        this.error(
          `Sonner is in the bundle, but none of its modules defines "${INSERT_CSS}", so its inline styles were not cut out and the shell's content security policy would refuse them; see vite.config.ts`
        );
      }
    },
  };
};

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
