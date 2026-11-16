import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BuildOptions } from "rolldown";

export type BuildMode = "dev" | "prod";

export const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

/** Each mode builds into a folder of its own, which is a complete app. */
export const outDir = (mode: BuildMode) =>
  path.join(repositoryRoot, "out", mode);

export const shellViteConfig = path.join(
  repositoryRoot,
  "packages",
  "shell",
  "vite.config.ts"
);

interface RootManifest {
  name: string;
  productName: string;
  version: string;
  meru: { appId: string };
}

export const readRootManifest = async () =>
  JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf-8")
  ) as RootManifest;

export const cleanOutDir = async (mode: BuildMode) => {
  await rm(outDir(mode), { recursive: true, force: true });
  await mkdir(outDir(mode), { recursive: true });
};

/** The `package.json` Electron reads the app's name, version and entry from. */
export const writeAppManifest = async (
  mode: BuildMode,
  manifest: RootManifest
) => {
  await writeFile(
    path.join(outDir(mode), "package.json"),
    `${JSON.stringify(
      {
        name: manifest.name,
        productName: manifest.productName,
        version: manifest.version,
        private: true,
        main: "main.mjs",
      },
      undefined,
      2
    )}\n`
  );
};

/** The main process and the preloads, which rolldown bundles. */
export const appBundles = (
  mode: BuildMode,
  manifest: RootManifest
): BuildOptions[] => {
  const minify = mode === "prod" ? { mangle: { keepNames: true } } : false;

  return [
    {
      input: path.join(repositoryRoot, "packages", "main", "src", "index.ts"),
      platform: "node",
      external: ["electron"],
      transform: {
        define: {
          MERU_BUILD_MODE: JSON.stringify(mode),
          MERU_APP_ID: JSON.stringify(manifest.meru.appId),
          MERU_PRODUCT_NAME: JSON.stringify(manifest.productName),
        },
      },
      output: {
        file: path.join(outDir(mode), "main.mjs"),
        format: "esm",
        minify,
        sourcemap: mode === "dev",
      },
    },
    {
      input: path.join(
        repositoryRoot,
        "packages",
        "preload-shell",
        "src",
        "index.ts"
      ),
      // A sandboxed preload cannot load modules, so it is one CommonJS file.
      platform: "browser",
      external: ["electron"],
      output: {
        file: path.join(outDir(mode), "preload-shell.cjs"),
        format: "cjs",
        minify,
        sourcemap: mode === "dev",
      },
    },
  ];
};
