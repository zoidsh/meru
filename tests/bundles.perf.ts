/*
 * What the app ships, in bytes, against a budget kept next to this file.
 *
 * The only measurement here that is not a measurement at all. Every other figure
 * the performance tests take belongs to the machine that took it; a bundle is
 * the same number of bytes on every machine that builds it, so this one can hold
 * a checked-in budget and fail when the build outgrows it.
 *
 * That makes most of the audit's P4 tier — bundle size — into something CI can
 * enforce. It is the direct proof for finding 1.4, a preload that carries React
 * and sonner for one toast and weighs three quarters of a megabyte in total, and
 * for the two halves of finding 4.5 that are files: the notification sounds
 * shipped as WAV, and the Inter subsets the interface never renders.
 *
 * The per-process half of P4 — spellcheck on views with no input, popups loading
 * the full React chunk — is a runtime cost rather than a file, and belongs to
 * the memory report rather than here.
 *
 * The budgets are ceilings with a little room, not a mirror of what the build
 * currently weighs. Landing a win means lowering the ceiling to lock it in, and
 * a feature that genuinely needs the bytes means raising it on purpose, in a
 * diff where a reviewer sees the number change.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { recordSection } from "./lib/report";

const BUNDLES_DIRECTORY = path.join(process.cwd(), "build-js");

const BUDGET_PATH = path.join(process.cwd(), "tests", "bundle-budget.json");

/**
 * When a file is under its budget by more than both of these, the ceiling is
 * asked to come down.
 *
 * Both, not either. A proportion alone flags every small chunk from the day the
 * budgets are written, because the budget floor that keeps a 144-byte chunk from
 * tripping over a whitespace change is necessarily most of its size — and a
 * warning that fires on a dozen files at rest is one nobody reads. An absolute
 * gap is what makes it fire only when a win worth locking in has landed.
 */
const SLACK_WARNING_RATIO = 0.9;

const SLACK_WARNING_BYTES = 16 * 1024;

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
const SHIPPED_EXTENSIONS = [".js", ".css", ".wav", ".woff2"];

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

function budgetKey(bundle: string) {
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
async function readBuiltBundles() {
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

/*
 * Linux only, and not because the other platforms are unsupported. `bun run
 * build:js` bundles the same sources with the same bundler wherever it runs, so
 * one platform's answer is every platform's — and running it three times would
 * turn one budget file into a claim about three toolchains that nobody has
 * checked. If Windows ever does produce a different byte count, this test going
 * green there would be the reason nobody found out.
 */
test.skip(
  process.platform !== "linux",
  "Bundle sizes are platform-independent, so they are checked once, on Linux.",
);

// oxlint-disable-next-line no-empty-pattern
test("no bundle is over budget", async ({}, testInfo) => {
  const budgets: Record<string, number> = JSON.parse(await readFile(BUDGET_PATH, "utf8"));

  const built = await readBuiltBundles();

  /*
   * A build with nothing in it fails rather than passes. `bun run test:perf`
   * builds before it runs, but MERU_EXECUTABLE skips that build, and a budget
   * check that quietly goes green having found nothing to measure is worse than
   * no check at all.
   */
  expect(built.size, "build-js is empty; run `bun run build:js` first").toBeGreaterThan(0);

  const measured = Object.fromEntries(
    [...built].sort(([left], [right]) => left.localeCompare(right)),
  );

  await testInfo.attach("bundle-sizes", {
    body: JSON.stringify(measured, null, 2),
    contentType: "application/json",
  });

  await recordSection("bundles", measured);

  /*
   * A base-commit run stops here, having recorded the sizes and checked nothing.
   *
   * It pairs an older build with this checkout's budget file, and that pairing
   * is not a check of anything. A pull request that adds a chunk, removes one,
   * or lowers a ceiling to lock in a win — the three things the header above
   * tells people to do — fails an assertion below against a build made before
   * it did any of them, and the failure surfaces in a step named after the base
   * commit on a pull request that is perfectly healthy. Reproduced both ways:
   * one added budget row and one lowered ceiling turn the base run red.
   *
   * The sizes are still recorded, because the delta between the two runs is the
   * whole reason the base one happens.
   */
  if (process.env.MERU_PERF_BASELINE) {
    console.log(
      `[perf] recorded ${built.size} bundle sizes from the base build; the budgets belong to head and are not checked against it`,
    );

    return;
  }

  console.log(
    `[perf] bundle sizes\n${Object.entries(measured)
      .map(([bundle, size]) => {
        const budget = budgets[bundle];

        return `  ${bundle.padEnd(44)}${`${(size / 1024).toFixed(1)} KB`.padStart(11)} of ${budget === undefined ? "no budget" : `${(budget / 1024).toFixed(1)} KB`.padStart(11)}`;
      })
      .join("\n")}`,
  );

  /*
   * A bundle with no budget is the failure this pair of assertions exists for:
   * a new chunk that nobody set a ceiling on is exactly how the tier goes
   * unheld. It is reported as its own list rather than compared against zero, so
   * the message names the chunks to add.
   */
  expect
    .soft(
      Object.keys(measured).filter((bundle) => !(bundle in budgets)),
      "bundles with no budget in tests/bundle-budget.json",
    )
    .toEqual([]);

  expect
    .soft(
      Object.keys(budgets).filter((bundle) => !(bundle in measured)),
      "budgets in tests/bundle-budget.json for bundles the build no longer produces",
    )
    .toEqual([]);

  // Soft, so a build that outgrew several budgets reports all of them rather
  // than sending someone round the loop once per file.
  for (const [bundle, size] of Object.entries(measured)) {
    const budget = budgets[bundle];

    if (budget !== undefined) {
      expect.soft(size, `${bundle} is over its budget`).toBeLessThanOrEqual(budget);
    }
  }

  /*
   * Reported, never failed. A build coming in well under budget is a win, and
   * failing the run for it would have the next person raise the ceiling to get
   * green — the opposite of what a budget is for. Saying so in the log is what
   * gets the ceiling lowered instead.
   */
  const slack = Object.entries(measured).filter(
    ([bundle, size]) =>
      budgets[bundle] !== undefined &&
      size < (budgets[bundle] as number) * SLACK_WARNING_RATIO &&
      (budgets[bundle] as number) - size > SLACK_WARNING_BYTES,
  );

  if (slack.length > 0) {
    console.log(
      `[perf] under budget by more than a tenth — lower these in tests/bundle-budget.json to keep the win:\n${slack
        .map(([bundle, size]) => `  ${bundle}: ${size} bytes against ${budgets[bundle]}`)
        .join("\n")}`,
    );
  }
});
