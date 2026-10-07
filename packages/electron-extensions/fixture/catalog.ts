/**
 * What the app hands the fixture where a curated extension's catalog entry
 * would hand it something, so the end-to-end suite can drive each of those
 * paths without a real extension. Importable without touching Electron.
 */

/**
 * Declared on top of the fixture's own content script, the way a catalog entry
 * declares the scripts its worker would inject. One script per world, since a
 * MAIN-world entry is the one the derive leaves unshimmed. `declared.js` also
 * stands in for `stand-in.js`, a file the package carries and nothing declares:
 * the worker's `executeScript` for it is answered by `declared.js` already
 * being there, the way Bitwarden's for one of its four bootstrap variants is
 * answered by the superset.
 */
export const FIXTURE_DECLARED_CONTENT_SCRIPTS = [
  {
    js: ["declared.js"],
    matches: ["http://127.0.0.1/*"],
    runAt: "document_idle" as const,
    allFrames: true,
    standsInFor: ["stand-in.js"],
  },
  {
    js: ["declared-main.js"],
    matches: ["http://127.0.0.1/*"],
    runAt: "document_idle" as const,
    world: "MAIN" as const,
  },
];

/** A key the fixture's worker never writes, so it holds only the default. */
export const FIXTURE_LOCAL_STORAGE_DEFAULTS = { seededDefault: "from the catalog" };
