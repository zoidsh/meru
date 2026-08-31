/*
 * What the app ships, in bytes, against a budget kept next to this file.
 *
 * The measurement here that is not a measurement at all. Most of what the
 * performance tests take belongs to the machine that took it; a bundle is the
 * same number of bytes on every machine that builds it, so this one can hold a
 * checked-in budget and fail when the build outgrows it. The main process's
 * JavaScript heap now holds one too, and `tests/memory.perf.ts` explains what
 * earned it — a figure V8 counts rather than the operating system attributes,
 * measured across three platforms before it was gated. Nothing else does.
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
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { readBuiltBundles } from "./lib/bundles";
import { recordSection } from "./lib/report";

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
