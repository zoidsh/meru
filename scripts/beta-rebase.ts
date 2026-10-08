/*
 * The rebase of `beta` onto `main` has to drop two kinds of commit that git
 * would otherwise replay. Beta version commits only bump `package.json`, and
 * conflict with every stable's. A promoted commit whose patch was adjusted on
 * its way to `main` no longer matches by patch, so git replays it, and its
 * changelog hunk keeps it non-empty: after a stable has emptied
 * `[Unreleased]`, the replay brings the released line back without a conflict.
 * Promotion keeps the commit's subject, so both are dropped by subject.
 */
import { $ } from "bun";

const BETA_VERSION_SUBJECT = /^\d+\.\d+\.\d+-beta\.\d+$/;

// Git 2.54 writes `pick <sha> # <subject>`, older versions `pick <sha> <subject>`.
const TODO_PICK = /^pick [0-9a-f]+ (?:# )?(.*)$/;

export function filterTodo(todo: string, mainSubjects: ReadonlySet<string>) {
  const kept = todo.split("\n").filter((line) => {
    const subject = TODO_PICK.exec(line)?.[1];

    return (
      subject === undefined || !(BETA_VERSION_SUBJECT.test(subject) || mainSubjects.has(subject))
    );
  });

  // Git aborts a rebase whose todo list is empty, which would leave `beta`
  // where it was rather than on `main`.
  if (!kept.some((line) => line.trim() !== "" && !line.startsWith("#"))) {
    kept.unshift("noop");
  }

  return kept.join("\n");
}

export function promotedSubjects(betaSubjects: string[], mainSubjects: ReadonlySet<string>) {
  return betaSubjects.filter((subject) => mainSubjects.has(subject));
}

function lines(output: string) {
  return output.split("\n").filter(Boolean);
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
    const todo = await Bun.file(todoPath).text();

    await Bun.write(todoPath, filterTodo(todo, await mainSubjectsSinceBeta()));
  } else if (command === "check") {
    const betaSubjects = lines(await $`git log --format=%s origin/main..HEAD`.text());
    // All of main, not only what landed since `origin/beta`'s base: once
    // `beta` is pushed that base is main's tip, and the check would pass
    // vacuously.
    const mainSubjects = new Set(lines(await $`git log --format=%s origin/main`.text()));
    const promoted = promotedSubjects(betaSubjects, mainSubjects);

    if (promoted.length > 0) {
      console.error(
        `These commits are already on main and must not stay on beta:\n${promoted.join("\n")}`,
      );
      process.exit(1);
    }
  } else {
    throw new Error("Usage: bun scripts/beta-rebase.ts todo <file> | check");
  }
}
