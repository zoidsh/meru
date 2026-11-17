import { copyFile, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BuildOptions } from "rolldown";

import { appIdentity } from "#core/app-identity.ts";
import type { Platform } from "#core/platform.ts";
import { trayImageNames } from "#core/tray.ts";

import manifest from "../../package.json" with { type: "json" };
import { linguiForRolldown } from "./lingui.ts";

/**
 * What a build is for. `e2e` is a production build that also carries what only
 * the end-to-end suite may switch on; a release is only ever built as `prod`.
 */
export type BuildTarget = "dev" | "prod" | "e2e";

export const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

/** Each target builds into a folder of its own, which is a complete app. */
export const outDir = (target: BuildTarget) =>
  path.join(repositoryRoot, "out", target);

export const shellViteConfig = path.join(repositoryRoot, "vite.config.ts");

/** Only `prod` builds a release; `pnpm start` runs the same build. */
export const identityFor = (target: BuildTarget) =>
  appIdentity({ version: manifest.version, isRelease: target === "prod" });

export const cleanOutDir = async (target: BuildTarget) => {
  await rm(outDir(target), { recursive: true, force: true });
  await mkdir(outDir(target), { recursive: true });
};

/** The `package.json` Electron reads the app's name, version and entry from. */
export const writeAppManifest = async (target: BuildTarget) => {
  await writeFile(
    path.join(outDir(target), "package.json"),
    `${JSON.stringify(
      {
        name: manifest.name,
        productName: identityFor(target).productName,
        version: manifest.version,
        private: true,
        main: "main.mjs",
      },
      undefined,
      2
    )}\n`
  );
};

/**
 * The tray's images for the platform this builds on, which is the one it
 * packs for, into `tray` beside main's bundle.
 */
export const copyTrayImages = async (target: BuildTarget) => {
  const directory = path.join(outDir(target), "tray");

  await mkdir(directory, { recursive: true });
  await Promise.all(
    trayImageNames(process.platform as Platform).map((name) =>
      copyFile(
        path.join(repositoryRoot, "resources", "tray", name),
        path.join(directory, name)
      )
    )
  );
};

/** Gmail's preload, which loads with every document in Gmail's view. */
export const GMAIL_PRELOAD = "preload-gmail.cjs";

/**
 * What a production build allows Gmail's preload, minified: room to grow by
 * the page features, and a wall against a library pulled in by accident.
 */
export const GMAIL_PRELOAD_BUDGET = 16 * 1024;

export const appBundles = (target: BuildTarget): BuildOptions[] => {
  const mode = target === "dev" ? "dev" : "prod";
  const minify = mode === "prod" ? { mangle: { keepNames: true } } : false;

  return [
    {
      input: path.join(repositoryRoot, "src", "main", "index.ts"),
      platform: "node",
      external: ["electron"],
      plugins: linguiForRolldown(mode === "prod"),
      transform: {
        define: {
          MERU_BUILD_MODE: JSON.stringify(mode),
          MERU_E2E_BUILD: JSON.stringify(target === "e2e"),
          MERU_APP_ID: JSON.stringify(identityFor(target).appId),
          // Libraries drop their development-only code on it, such as
          // Lingui's message compiler, which a catalog compiled at build time
          // makes dead weight.
          "process.env.NODE_ENV": JSON.stringify(
            mode === "prod" ? "production" : "development"
          ),
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
      input: path.join(repositoryRoot, "src", "preload", "shell", "index.ts"),
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
    {
      input: path.join(repositoryRoot, "src", "preload", "gmail", "index.ts"),
      platform: "browser",
      external: ["electron"],
      transform: {
        define: { MERU_E2E_BUILD: JSON.stringify(target === "e2e") },
      },
      output: {
        file: path.join(outDir(target), GMAIL_PRELOAD),
        format: "cjs",
        minify,
        sourcemap: mode === "dev",
      },
    },
  ];
};
