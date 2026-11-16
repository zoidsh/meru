import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { build as bundle } from "rolldown";
import { build as buildRenderer } from "vite";

import {
  appBundles,
  cleanOutDir,
  outDir,
  readRootManifest,
  shellViteConfig,
  writeAppManifest,
} from "./lib/bundles.ts";
import { findForbiddenMarkers } from "./lib/forbidden-markers.ts";

const manifest = await readRootManifest();

await cleanOutDir("prod");

await Promise.all([
  ...appBundles("prod", manifest).map((options) => bundle(options)),
  buildRenderer({
    configFile: shellViteConfig,
    mode: "production",
    logLevel: "warn",
    build: { outDir: path.join(outDir("prod"), "shell"), emptyOutDir: true },
  }),
  writeAppManifest("prod", manifest),
]);

const entries = await readdir(outDir("prod"), {
  recursive: true,
  withFileTypes: true,
});

const files = await Promise.all(
  entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const filePath = path.join(entry.parentPath, entry.name);

      return {
        path: path.relative(outDir("prod"), filePath),
        contents: await readFile(filePath, "utf-8"),
      };
    })
);

const hits = findForbiddenMarkers(files);

if (hits.length > 0) {
  for (const hit of hits) {
    console.error(`out/prod/${hit.path} holds "${hit.marker}": ${hit.why}`);
  }

  // A rejected build must not be left for `pnpm start` to run.
  await rm(outDir("prod"), { recursive: true, force: true });
  console.error("Removed out/prod.");
  process.exit(1);
}

console.log(
  `Built ${manifest.productName} ${manifest.version} into out/prod; checked ${files.length} files for development-only markers`
);
