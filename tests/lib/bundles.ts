/*
 * Reading a build's shipped files and naming them the way a budget file does.
 *
 * Shared by `tests/bundles.perf.ts`, which checks the build the end-to-end run
 * made, and `scripts/check-bundle-budget.ts`, which builds the stable channel
 * and checks that. The rules for what counts and how a name is keyed belong in
 * one place: two copies would drift, and the copy that drifted would be the one
 * quietly measuring less.
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const BUNDLES_DIRECTORY = path.join(process.cwd(), "build-js");

/**
 * Where Vite writes the renderer chunks, and the only place a name carries a
 * content hash. The preloads and the main-process bundle are written by
 * rolldown under plain names, so nothing outside this directory is stripped —
 * `preload-renderer.js` ends in eight word characters and would otherwise be
 * filed under `preload.js`.
 */
const HASHED_DIRECTORY = "renderer/assets/";

/**
 * What counts as something the app ships.
 *
 * Sounds and fonts are here rather than code alone, because two of them are an
 * audit finding in their own right: roughly 1.7 MB of WAV notification sounds
 * that Opus takes to under 100 KB, and four Inter subsets — Cyrillic, Greek and
 * Vietnamese — the interface never renders a glyph from. Checking bytes while
 * looking only at JavaScript left the largest single file in the build, and
 * nearly 2 MB in total, unmeasured.
 */
export const SHIPPED_EXTENSIONS = [".js", ".css", ".wav", ".woff2"];

/**
 * The hash itself, which changes with every edit to what is in the chunk.
 * Budgets are keyed by the name without it, or `main-BVYKszf8.js` would need a
 * new budget row on every commit and the check would measure nothing but churn.
 *
 * Nothing is required of the eight characters beyond their being there. Asking
 * for a digit or a capital, on the reasoning that eight lowercase letters read
 * more like a word than a hash, turned out to be a way to fail: the alphabet is
 * base64url, so `-` and `_` are in it, and about one hash in eight hundred is
 * drawn entirely from the lowercase half. That build would key the file under
 * its full name, report it as having no budget and its budget as belonging to
 * nothing, and go red on a pull request that touched neither — then fix itself
 * on the next commit. A guard that fires at random on unrelated work is worse
 * than the case it guards against, which is a Vite configuration that stopped
 * hashing at all, and the stale-budget check below catches that anyway.
 */
const CONTENT_HASH = /-[\w-]{8}(?=\.[^.]+$)/;

export function budgetKey(bundle: string) {
  // Separators are normalized, because Windows hands back backslashes and a
  // budget file cannot be keyed two ways.
  const normalized = bundle.replaceAll("\\", "/");

  return normalized.startsWith(HASHED_DIRECTORY)
    ? normalized.replace(CONTENT_HASH, "")
    : normalized;
}

/**
 * Every built bundle, keyed the way a budget names it.
 *
 * Two chunks whose names collide once the hash is off would silently become one
 * row, and the one left out would be the unmeasured bundle this whole file
 * exists to prevent — so the collision is raised instead.
 */
export async function readBuiltBundles() {
  const sizes = new Map<string, number>();

  /*
   * `node:fs` rather than Bun's `Glob`, because the runner is Node even in a
   * repository that is Bun everywhere else — Playwright spawns its workers
   * itself, and importing `bun` from one throws at the import.
   *
   * Recursive readdir lists directories alongside files; filtering on the
   * extensions drops them without a second stat per entry.
   */
  const entries = await readdir(BUNDLES_DIRECTORY, { recursive: true });

  for (const bundle of entries.filter((entry) =>
    SHIPPED_EXTENSIONS.some((extension) => entry.endsWith(extension)),
  )) {
    const key = budgetKey(bundle);

    if (sizes.has(key)) {
      throw new Error(
        `Two bundles share the budget name ${key}. Give one of them a distinct chunk name.`,
      );
    }

    sizes.set(key, (await stat(path.join(BUNDLES_DIRECTORY, bundle))).size);
  }

  return sizes;
}
