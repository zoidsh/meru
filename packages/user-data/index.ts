import { execFileSync } from "node:child_process";
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
  branch: string
): string =>
  path.join(root, ".meru", toProfileName(named ?? (branch || "default")));

/** The branch checked out at `root`; empty on a detached HEAD or outside a repository. */
export const currentBranch = (root: string): string => {
  try {
    return execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

export interface UserDataInputs {
  /** The checkout the app runs from. */
  readonly root: string;
  readonly packaged: boolean;
  /** The checkout a locally packaged app was built from, as its `local-package` marker names it. */
  readonly markerRepo?: string;
  /** The directory `--user-data-dir` named. */
  readonly explicitDir?: string;
  /** The branch checked out at `root`; empty or absent on a detached HEAD. */
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
  branch = "",
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
