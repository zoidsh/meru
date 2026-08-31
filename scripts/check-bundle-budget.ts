/*
 * Builds the stable channel and checks what it weighs against
 * `tests/bundle-budget-stable.json`.
 *
 * The budget in `tests/bundle-budget.json` describes the build the end-to-end
 * run makes, and that build is on the Experimental channel — its fixture tests
 * need the extensions the stable artifact leaves out. So the file everyone
 * installs is the one build nothing was measuring. This is the second half of
 * that pair, and it is what makes a feature's absence from stable a thing CI
 * holds rather than a number someone quoted once: an import that reaches an
 * alpha-only module from a path stable executes re-links the whole thing, and
 * the ceiling it blows through says so.
 *
 * It writes `build-js`, so it replaces whatever build is sitting there.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "bun";
import { readBuiltBundles } from "../tests/lib/bundles";

const BUDGET_PATH = path.join(process.cwd(), "tests", "bundle-budget-stable.json");

const { exited } = spawn(["bun", "run", "scripts/build.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env, MERU_BUILD_CHANNEL: "stable" },
});

const buildStatus = await exited;

if (buildStatus !== 0) {
  process.exit(buildStatus);
}

const budgets: Record<string, number> = JSON.parse(await readFile(BUDGET_PATH, "utf8"));

const built = await readBuiltBundles();

// A build with nothing in it fails rather than passes, as in the performance
// check: a budget run that goes green having found nothing to measure is worse
// than no run at all.
if (built.size === 0) {
  console.error("build-js is empty; the stable build produced nothing to measure.");

  process.exit(1);
}

const measured = Object.fromEntries(
  [...built].sort(([left], [right]) => left.localeCompare(right)),
);

console.log(
  `stable bundle sizes\n${Object.entries(measured)
    .map(([bundle, size]) => {
      const budget = budgets[bundle];

      return `  ${bundle.padEnd(44)}${`${(size / 1024).toFixed(1)} KB`.padStart(11)} of ${budget === undefined ? "no budget" : `${(budget / 1024).toFixed(1)} KB`.padStart(11)}`;
    })
    .join("\n")}`,
);

const problems: string[] = [];

/*
 * A bundle with no budget and a budget for a bundle that is gone are the two
 * failures worth having here.
 *
 * The second is the one that catches this feature coming back: the extension
 * scripts and the fixture are written only on the Experimental channel, so a
 * change that starts writing them into a stable build fails on files the budget
 * file has never heard of.
 */
const unbudgeted = Object.keys(measured).filter((bundle) => !(bundle in budgets));

if (unbudgeted.length > 0) {
  problems.push(
    `Bundles with no budget in ${path.relative(process.cwd(), BUDGET_PATH)}: ${unbudgeted.join(", ")}`,
  );
}

const stale = Object.keys(budgets).filter((bundle) => !(bundle in measured));

if (stale.length > 0) {
  problems.push(
    `Budgets for bundles the stable build no longer produces: ${stale.join(", ")}. Remove them.`,
  );
}

for (const [bundle, size] of Object.entries(measured)) {
  const budget = budgets[bundle];

  if (budget !== undefined && size > budget) {
    problems.push(`${bundle} is over its budget: ${size} bytes against ${budget}.`);
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.join("\n")}`);

  process.exit(1);
}

console.log(`\nAll ${built.size} stable bundles are within budget.`);
