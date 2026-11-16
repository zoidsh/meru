import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { build as bundle } from "rolldown";
import { build as buildRenderer } from "vite";

import {
  appBundles,
  cleanOutDir,
  identityFor,
  outDir,
  readRootManifest,
  repositoryRoot,
  shellViteConfig,
  writeAppManifest,
} from "./lib/bundles.ts";
import {
  FORBIDDEN_IN_PROD,
  FORBIDDEN_IN_RELEASE,
  findForbiddenMarkers,
} from "./lib/forbidden-markers.ts";

const target = process.argv.includes("--e2e") ? "e2e" : "prod";
const out = outDir(target);
const label = path.relative(repositoryRoot, out);

const manifest = await readRootManifest();

await cleanOutDir(target);

await Promise.all([
  ...appBundles(target, manifest).map((options) => bundle(options)),
  buildRenderer({
    configFile: shellViteConfig,
    mode: "production",
    logLevel: "warn",
    build: { outDir: path.join(out, "shell"), emptyOutDir: true },
  }),
  writeAppManifest(target, manifest),
]);

const entries = await readdir(out, { recursive: true, withFileTypes: true });

const files = await Promise.all(
  entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const filePath = path.join(entry.parentPath, entry.name);

      return {
        path: path.relative(out, filePath),
        contents: await readFile(filePath, "utf-8"),
      };
    })
);

const hits = findForbiddenMarkers(
  files,
  target === "prod"
    ? [...FORBIDDEN_IN_PROD, ...FORBIDDEN_IN_RELEASE]
    : FORBIDDEN_IN_PROD
);

if (hits.length > 0) {
  for (const hit of hits) {
    console.error(`${label}/${hit.path} holds "${hit.marker}": ${hit.why}`);
  }

  // A rejected build must not be left for `pnpm start` or packaging to use.
  await rm(out, { recursive: true, force: true });
  console.error(`Removed ${label}.`);
  process.exit(1);
}

console.log(
  `Built ${identityFor(target, manifest).productName} ${manifest.version} into ${label}; checked ${files.length} files for markers it must not hold`
);
