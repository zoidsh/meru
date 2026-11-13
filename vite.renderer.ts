import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

import { app, dist, withBase } from "./vite.base.ts";

const pages = path.join(app, "renderer/pages");

export default defineConfig(
  withBase({
    // Relative, because the built pages load over file://.
    base: "./",
    build: {
      outDir: path.join(dist, "renderer"),
      rolldownOptions: {
        input: {
          chrome: path.join(pages, "chrome.html"),
          overlay: path.join(pages, "overlay.html"),
          settings: path.join(pages, "settings.html"),
        },
      },
    },
    plugins: [react(), tailwindcss()],
    root: pages,
    server: { host: "127.0.0.1", strictPort: false },
  })
);
