import { builtinModules } from "node:module";
import path from "node:path";

import { mergeConfig } from "vite-plus";
import type { UserConfig } from "vite-plus";

export const root = import.meta.dirname;
export const app = path.join(root, "app");
export const dist = path.join(app, "dist");

const base: UserConfig = {
  build: { emptyOutDir: true, sourcemap: true },
  clearScreen: false,
  envPrefix: "MERU_PUBLIC_",
};

export const withBase = (config: UserConfig): UserConfig =>
  mergeConfig(base, config);

/** Main and preloads run in Node or Electron, which supply these at runtime rather than from the bundle. */
export const nodeExternal = [
  "electron",
  /^electron\//u,
  /^node:/u,
  ...builtinModules,
];

/** A Node-side bundle of one entry into `dist/<outDir>`. */
export const nodeLibrary = (options: {
  entry: string;
  outDir: string;
  fileName: string;
  format: "es" | "cjs";
}): UserConfig =>
  withBase({
    build: {
      lib: {
        entry: options.entry,
        fileName: () => options.fileName,
        formats: [options.format],
      },
      minify: false,
      outDir: path.join(dist, options.outDir),
      rolldownOptions: { external: nodeExternal },
      target: "node24",
    },
  });

// A sandboxed preload can be neither an ES module nor require a chunk it shares with another preload, so each is a CommonJS build of its own into `dist/preload`, which none of them empties.
export const preloadLibrary = (name: string): UserConfig =>
  mergeConfig(
    nodeLibrary({
      entry: path.join(app, `preload/${name}/index.ts`),
      fileName: `${name}.cjs`,
      format: "cjs",
      outDir: "preload",
    }),
    { build: { emptyOutDir: false } }
  );
