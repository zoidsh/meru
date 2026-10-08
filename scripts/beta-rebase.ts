/*
 * The rebase of `beta` onto `main` has to drop two kinds of commit that git
 * would otherwise replay. Beta version commits only bump `package.json`, and
 * conflict with every stable's. A promoted commit whose patch was adjusted on
 * its way to `main` no longer matches by patch, so git replays it, and its
 * changelog hunk keeps it non-empty: after a stable has emptied
 * `[Unreleased]`, the replay brings the released line back without a conflict.
 * Promotion keeps the commit's subject, so both are dropped by subject.
 *
 * Matching is by whole subject, so a commit on `beta` without a PR number in
 * its subject must not share that subject with any commit on `main`, or it is
 * dropped as if it had been promoted.
 */
import { $ } from "bun";

const BETA_VERSION_SUBJECT = /^\d+\.\d+\.\d+-beta\.\d+$/;

// Only the command and the SHA have a fixed shape: `rebase.abbreviateCommands`
// writes `p` for `pick`, and `rebase.instructionFormat` replaces everything
// after the SHA, so the subject is read from git rather than from the line.
const TODO_PICK = /^(?:pick|p) ([0-9a-f]+)(?:\s|$)/;

export type DroppedLine = { line: string; reason: string };

export function filterTodo(
  todo: string,
  mainSubjects: ReadonlySet<string>,
  subjectOf: (sha: string) => string,
) {
  const dropped: DroppedLine[] = [];

  const kept = todo.split("\n").filter((line) => {
    if (line.trim() === "" || line.startsWith("#") || line.trim() === "noop") {
      return true;
    }

    const sha = TODO_PICK.exec(line)?.[1];

    if (sha === undefined) {
      throw new Error(
        `Unrecognised rebase todo line, so nothing was filtered: ${line}\nOnly pick lines are expected; run the rebase without options that add other commands.`,
      );
    }

    const subject = subjectOf(sha);

    if (BETA_VERSION_SUBJECT.test(subject)) {
      dropped.push({ line, reason: "beta version commit" });

      return false;
    }

    if (mainSubjects.has(subject)) {
      dropped.push({ line, reason: `already on main as "${subject}"` });

      return false;
    }

    return true;
  });

  // Git aborts a rebase whose todo list is empty, which would leave `beta`
  // where it was rather than on `main`.
  if (!kept.some((line) => line.trim() !== "" && !line.startsWith("#"))) {
    kept.unshift("noop");
  }

  return { todo: kept.join("\n"), dropped };
}

type Commit = { sha: string; subject: string };

/** Each commit on `beta` whose subject is also on `main`, with the first `main` commit carrying it. */
export function sharedSubjects(betaCommits: Commit[], mainCommits: Commit[]) {
  const onMain = new Map<string, string>();

  for (const { sha, subject } of mainCommits) {
    if (!onMain.has(subject)) {
      onMain.set(subject, sha);
    }
  }

  return betaCommits.flatMap((commit) => {
    const mainSha = onMain.get(commit.subject);

    return mainSha === undefined ? [] : [{ ...commit, mainSha }];
  });
}

export function sharedSubjectsMessage(shared: ReturnType<typeof sharedSubjects>) {
  return [
    "These commits on beta share their subject with a commit on main:",
    ...shared.map(
      ({ sha, subject, mainSha }) =>
        `  ${sha.slice(0, 10)} ${subject} (main: ${mainSha.slice(0, 10)})`,
    ),
    "",
    "A promoted commit the rebase kept: rebase again with the sequence editor in CLAUDE.md, which drops it.",
    "A different commit that happens to match an older one on main: give it its own subject, with",
    "`git rebase -i <sha>~1` and `reword` on its line. The check reads all of main on purpose, so",
    "the subject has to change rather than the check.",
  ].join("\n");
}

function lines(output: string) {
  return output.split("\n").filter(Boolean);
}

async function commits(range: string) {
  return lines(await $`git log --format=${"%H %s"} ${range}`.text()).map((line) => {
    const space = line.indexOf(" ");

    return { sha: line.slice(0, space), subject: line.slice(space + 1) };
  });
}

function gitSubject(sha: string) {
  const result = Bun.spawnSync(["git", "log", "-1", "--format=%s", sha]);

  if (result.exitCode !== 0) {
    throw new Error(`git log could not read commit ${sha}: ${result.stderr.toString()}`);
  }

  return result.stdout.toString().trim();
}

/**
 * What landed on `main` since the `beta` on the remote was last based on it.
 * Read from the remote refs, because the rebase moves `HEAD` and `origin/beta`
 * only moves at the push.
 */
async function mainSubjectsSinceBeta() {
  const base = (await $`git merge-base origin/beta origin/main`.text()).trim();

  return new Set(lines(await $`git log --format=%s ${base}..origin/main`.text()));
}

if (import.meta.main) {
  const [command, todoPath] = Bun.argv.slice(2);

  if (command === "todo" && todoPath) {
    const result = filterTodo(
      await Bun.file(todoPath).text(),
      await mainSubjectsSinceBeta(),
      gitSubject,
    );

    for (const { line, reason } of result.dropped) {
      console.error(`Dropped ${line}: ${reason}`);
    }

    await Bun.write(todoPath, result.todo);
  } else if (command === "check") {
    // All of main, not only what landed since `origin/beta`'s base: once
    // `beta` is pushed that base is main's tip, and the check would pass
    // vacuously.
    const shared = sharedSubjects(await commits("origin/main..HEAD"), await commits("origin/main"));

    if (shared.length > 0) {
      console.error(sharedSubjectsMessage(shared));
      process.exit(1);
    }
  } else {
    throw new Error("Usage: bun scripts/beta-rebase.ts todo <file> | check");
  }
}
