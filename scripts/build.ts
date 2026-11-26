import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { build as bundle } from "rolldown";
import { build as buildRenderer } from "vite";

import manifest from "../package.json" with { type: "json" };
import {
  GMAIL_PRELOAD,
  GMAIL_PRELOAD_BUDGET,
  SETTINGS_ONLY,
  appBundles,
  cleanOutDir,
  copyTrayImages,
  identityFor,
  outDir,
  RENDERERS,
  rendererRoot,
  rendererViteConfig,
  repositoryRoot,
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

await cleanOutDir(target);

await Promise.all([
  ...appBundles(target).map((options) => bundle(options)),
  ...RENDERERS.map((renderer) =>
    buildRenderer({
      configFile: rendererViteConfig,
      root: rendererRoot(renderer),
      mode: "production",
      logLevel: "warn",
      define: { MERU_E2E_BUILD: JSON.stringify(target === "e2e") },
      build: { outDir: path.join(out, renderer), emptyOutDir: true },
    })
  ),
  writeAppManifest(target),
  copyTrayImages(target),
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

const gmailPreload = files.find((file) => file.path === GMAIL_PRELOAD);
const gmailPreloadBytes = Buffer.byteLength(gmailPreload?.contents ?? "");
const preloadProblems = [
  ...(gmailPreload ? [] : [`${GMAIL_PRELOAD} is missing`]),
  ...(gmailPreloadBytes > GMAIL_PRELOAD_BUDGET
    ? [
        `${GMAIL_PRELOAD} is ${gmailPreloadBytes} bytes, over its budget of ${GMAIL_PRELOAD_BUDGET}`,
      ]
    : []),
  // Gmail's preload exposes nothing to the page's world.
  ...(gmailPreload?.contents.includes("contextBridge")
    ? [`${GMAIL_PRELOAD} reaches contextBridge`]
    : []),
];

const holdsMarkdown = (file: { contents: string }) =>
  file.contents.includes(SETTINGS_ONLY.marker);
const inSettings = (file: { path: string }) =>
  file.path.split(path.sep)[0] === SETTINGS_ONLY.folder;
const markdownProblems = [
  ...files
    .filter((file) => !inSettings(file) && holdsMarkdown(file))
    .map(
      (file) =>
        `${file.path} holds ${SETTINGS_ONLY.library}, which only the Settings window may`
    ),
  ...(files.some((file) => inSettings(file) && holdsMarkdown(file))
    ? []
    : [
        `${SETTINGS_ONLY.folder} is missing ${SETTINGS_ONLY.library}'s marker "${SETTINGS_ONLY.marker}", so the check that keeps it there checks nothing`,
      ]),
];

const hits = findForbiddenMarkers(
  files,
  target === "prod"
    ? [...FORBIDDEN_IN_PROD, ...FORBIDDEN_IN_RELEASE]
    : FORBIDDEN_IN_PROD
);

const problems = [...preloadProblems, ...markdownProblems];

if (hits.length > 0 || problems.length > 0) {
  for (const hit of hits) {
    console.error(`${label}/${hit.path} holds "${hit.marker}": ${hit.why}`);
  }

  for (const problem of problems) {
    console.error(`${label}/${problem}`);
  }

  // A rejected build must not be left for `pnpm start` or packaging to use.
  await rm(out, { recursive: true, force: true });
  console.error(`Removed ${label}.`);
  process.exit(1);
}

console.log(
  `Built ${identityFor(target).productName} ${manifest.version} into ${label}; checked ${files.length} files for markers it must not hold and for ${SETTINGS_ONLY.library} outside ${SETTINGS_ONLY.folder}, and ${GMAIL_PRELOAD} (${gmailPreloadBytes} bytes) against its budget of ${GMAIL_PRELOAD_BUDGET} and for contextBridge`
);
