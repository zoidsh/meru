import { readFileSync } from "node:fs";
import path from "node:path";

/** A branch or profile name as a directory name under `.meru`: slashes and anything else a path could choke on become dashes. */
export const toProfileName = (ref: string): string =>
  ref
    .replaceAll(/[^\w.-]+/gu, "-")
    .replaceAll(/^[.-]+|[.-]+$/gu, "")
    .slice(0, 64) || "default";

/**
 * The user data directory of a run from the repository: `.meru/<name>` for a named profile, else `.meru/<branch>`, and `.meru/default` on a detached HEAD. Each checkout has its own `.meru`, and Electron scopes its single instance lock to the directory, so two checkouts never share one.
 */
export const devUserDataDir = (
  root: string,
  named: string | undefined,
  branch: string | undefined
): string =>
  path.join(root, ".meru", toProfileName(named ?? branch ?? "default"));

const read = (file: string): string | undefined => {
  try {
    return readFileSync(file, "utf-8").trim();
  } catch {
    return undefined;
  }
};

/** The git directory of the checkout at `root`: `.git` itself, or in a worktree the directory its `.git` file names. */
const gitDirOf = (root: string): string | undefined => {
  const dotGit = path.join(root, ".git");
  const pointer = read(dotGit);
  if (pointer === undefined) {
    return dotGit;
  }
  const named = /^gitdir:\s*(?<dir>.+)$/u.exec(pointer)?.groups?.dir;
  return named === undefined ? undefined : path.resolve(root, named);
};

/** The branch checked out at `root`, read from the files git keeps; undefined on a detached HEAD or outside a repository. */
export const readBranch = (root: string): string | undefined => {
  const gitDir = gitDirOf(root);
  const head =
    gitDir === undefined ? undefined : read(path.join(gitDir, "HEAD"));
  return /^ref:\s*refs\/heads\/(?<branch>.+)$/u.exec(head ?? "")?.groups
    ?.branch;
};

export interface UserDataInputs {
  /** The checkout the app runs from. */
  readonly root: string;
  readonly packaged: boolean;
  /** The checkout a locally packaged app was built from, as its `local-package` marker names it. */
  readonly markerRepo?: string;
  /** The directory `--user-data-dir` named. */
  readonly explicitDir?: string;
  /** The branch checked out at `root`; absent on a detached HEAD. */
  readonly branch?: string;
}

/**
 * Where a run keeps its user data, or undefined for Electron's default, which an installed Meru shares with 3.x. A named directory wins; a run from the repository and a locally packaged app stay under their checkout's `.meru/`.
 */
export const userDataDirFor = ({
  root,
  packaged,
  markerRepo,
  explicitDir,
  branch,
}: UserDataInputs): string | undefined => {
  if (explicitDir !== undefined) {
    return explicitDir;
  }
  if (!packaged) {
    return devUserDataDir(root, undefined, branch);
  }
  return markerRepo === undefined
    ? undefined
    : path.join(markerRepo, ".meru", "packaged");
};
