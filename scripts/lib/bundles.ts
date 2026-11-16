import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BuildOptions } from "rolldown";

import { appIdentity } from "../../packages/core/src/app-identity.ts";

/**
 * What a build is for. `e2e` is a production build that also carries what only
 * the end-to-end suite may switch on; a release is only ever built as `prod`.
 */
export type BuildTarget = "dev" | "prod" | "e2e";

export const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

/** Each target builds into a folder of its own, which is a complete app. */
export const outDir = (target: BuildTarget) =>
  path.join(repositoryRoot, "out", target);

export const shellViteConfig = path.join(
  repositoryRoot,
  "packages",
  "shell",
  "vite.config.ts"
);

interface RootManifest {
  name: string;
  version: string;
}

/** Only `prod` builds a release; `pnpm start` runs the same build. */
export const identityFor = (target: BuildTarget, { version }: RootManifest) =>
  appIdentity({ version, isRelease: target === "prod" });

export const readRootManifest = async () =>
  JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf-8")
  ) as RootManifest;

export const cleanOutDir = async (target: BuildTarget) => {
  await rm(outDir(target), { recursive: true, force: true });
  await mkdir(outDir(target), { recursive: true });
};

/** The `package.json` Electron reads the app's name, version and entry from. */
export const writeAppManifest = async (
  target: BuildTarget,
  manifest: RootManifest
) => {
  await writeFile(
    path.join(outDir(target), "package.json"),
    `${JSON.stringify(
      {
        name: manifest.name,
        productName: identityFor(target, manifest).productName,
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
  target: BuildTarget,
  manifest: RootManifest
): BuildOptions[] => {
  const mode = target === "dev" ? "dev" : "prod";
  const minify = mode === "prod" ? { mangle: { keepNames: true } } : false;

  return [
    {
      input: path.join(repositoryRoot, "packages", "main", "src", "index.ts"),
      platform: "node",
      external: ["electron"],
      transform: {
        define: {
          MERU_BUILD_MODE: JSON.stringify(mode),
          MERU_E2E_BUILD: JSON.stringify(target === "e2e"),
          MERU_APP_ID: JSON.stringify(identityFor(target, manifest).appId),
        },
      },
      output: {
        file: path.join(outDir(target), "main.mjs"),
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
        file: path.join(outDir(target), "preload-shell.cjs"),
        format: "cjs",
        minify,
        sourcemap: mode === "dev",
      },
    },
  ];
};
