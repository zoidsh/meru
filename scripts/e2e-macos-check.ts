/*
 * Runs the end-to-end suite on this Mac and records the pass as a commit status,
 * which makes CI skip its hosted macOS job for that commit. Hosted macOS arm64
 * runners are short, and a self-hosted runner must never serve a public
 * repository, so the Mac reports a result rather than taking CI's jobs.
 *
 * Run it before pushing: CI reads the status seconds after a push, so one posted
 * afterwards would come too late. A status needs its commit to exist on GitHub,
 * and a ref outside refs/heads gets it there without triggering a workflow.
 */
import { $, spawn } from "bun";

const STATUS_CONTEXT = "e2e-macos-local";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function assertClean() {
  if ((await $`git status --porcelain`.text()).trim()) {
    fail("The working tree has changes, so a pass would not describe the commit. Commit first.");
  }
}

if (process.platform !== "darwin") {
  fail("This check runs on macOS.");
}

await assertClean();

const sha = (await $`git rev-parse HEAD`.text()).trim();

// CI runs the suite without the signed-in account, which only exists here.
const { MERU_TEST_ACCOUNT_EMAIL: _, ...env } = process.env;

const { exited } = spawn(["bun", "run", "test:e2e", "--retries=2", ...Bun.argv.slice(2)], {
  stdout: "inherit",
  stderr: "inherit",
  env,
});

const status = await exited;

if (status !== 0) {
  process.exit(status);
}

await assertClean();

if ((await $`git rev-parse HEAD`.text()).trim() !== sha) {
  fail(`HEAD moved during the run, so the pass for ${sha} goes unrecorded.`);
}

const ref = `refs/e2e-macos-check/${sha}`;
const repo = (await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.text()).trim();

await $`git push --quiet origin ${sha}:${ref}`;
await $`gh api --silent --method POST repos/${repo}/statuses/${sha} -f state=success -f context=${STATUS_CONTEXT} -f description=${"Passed on the Mac mini"}`;
await $`git push --quiet origin :${ref}`;

console.log(`Recorded ${STATUS_CONTEXT} on ${sha}. Push now, and CI skips its macOS job for it.`);
