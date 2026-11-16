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

console.log(`Built ${manifest.productName} ${manifest.version} into out/prod`);
