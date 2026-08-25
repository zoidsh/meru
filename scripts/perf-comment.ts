/*
 * Puts the performance comparison on the pull request, in one comment that is
 * rewritten on every push.
 *
 * One comment rather than one per run, because the figures are only ever worth
 * reading against the commit they were taken at: a pull request with twenty
 * pushes would otherwise carry nineteen tables that describe code nobody is
 * looking at any more. The marker at the top of the body is how the comment is
 * found again.
 *
 * Nothing in here is allowed to fail the job, and there are three ordinary ways
 * for it to have nothing to do or no way to do it: a push to main has no pull
 * request, a documentation-only diff skips the base measurement, and a pull
 * request from a fork gets a read-only token that cannot comment. None of those
 * is a broken build, so each one says so and exits.
 *
 *   bun run scripts/perf-comment.ts perf-reports
 */
import { MARKER, readComparisons, renderComparison } from "./perf-compare";

const API = "https://api.github.com";

type Comment = { id: number; body: string };

function requireEnvironment(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not set, so there is no way to know which pull request to comment on.`,
    );
  }

  return value;
}

async function call(method: string, url: string, token: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${method} ${url} answered ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

/**
 * The comment this job wrote last time, if it is still there.
 *
 * Matched on the marker rather than on who wrote it, so that the report keeps
 * its place when the token behind it changes — the Actions token and a personal
 * one comment as different authors, and a pull request that switched between
 * them should not end up with two tables.
 */
async function findExistingComment(repository: string, pullRequest: string, token: string) {
  let page = 1;

  while (true) {
    const comments = (await call(
      "GET",
      `${API}/repos/${repository}/issues/${pullRequest}/comments?per_page=100&page=${page}`,
      token,
    )) as Comment[];

    const existing = comments.find((comment) => comment.body?.startsWith(MARKER));

    if (existing) {
      return existing;
    }

    if (comments.length < 100) {
      return undefined;
    }

    page += 1;
  }
}

const roots = Bun.argv.slice(2);

const comparisons = await readComparisons(roots.length > 0 ? roots : ["perf-reports"]);

if (comparisons.length === 0) {
  console.log(
    `[perf] no reports were found in ${(roots.length > 0 ? roots : ["perf-reports"]).join(", ")}, so there is nothing to comment.`,
  );

  process.exit(0);
}

/*
 * Whether the matrix finished. A leg that failed before uploading is absent
 * from the table rather than marked absent, and a table of two platforms where
 * three belong reads as three that were fine — so the job's own result is
 * carried in and said plainly.
 */
const e2eResult = process.env.MERU_E2E_RESULT;

const body = renderComparison(
  comparisons,
  e2eResult && e2eResult !== "success"
    ? [
        `The end-to-end matrix finished as \`${e2eResult}\`. A platform missing from this table was not measured, rather than measured and unchanged.`,
      ]
    : [],
);

const repository = requireEnvironment("GITHUB_REPOSITORY");

const pullRequest = requireEnvironment("MERU_PULL_REQUEST");

const token = requireEnvironment("GITHUB_TOKEN");

try {
  const existing = await findExistingComment(repository, pullRequest, token);

  if (existing) {
    await call("PATCH", `${API}/repos/${repository}/issues/comments/${existing.id}`, token, {
      body,
    });

    console.log(`[perf] rewrote comment ${existing.id} on #${pullRequest}.`);
  } else {
    await call("POST", `${API}/repos/${repository}/issues/${pullRequest}/comments`, token, {
      body,
    });

    console.log(`[perf] commented on #${pullRequest}.`);
  }
} catch (error) {
  /*
   * Reported and survived rather than thrown. The comparison itself is in this
   * job's log — printed below, whatever happens to the comment — and a
   * performance report that could not be posted is not a reason to turn a pull
   * request red.
   */
  console.log(`[perf] could not post the comparison: ${(error as Error).message}`);

  console.log(body);
}
