import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  devUserDataDir,
  readBranch,
  toProfileName,
  userDataDirFor,
} from "./index.ts";

describe(devUserDataDir, () => {
  it("names the directory after the branch", () => {
    expect(devUserDataDir("/repo", undefined, "feature/sidebar")).toBe(
      path.join("/repo", ".meru", "feature-sidebar")
    );
  });

  it("falls back to default on a detached HEAD", () => {
    expect(devUserDataDir("/repo", undefined, "")).toBe(
      path.join("/repo", ".meru", "default")
    );
  });

  it("prefers a named profile", () => {
    expect(devUserDataDir("/repo", "demo", "main")).toBe(
      path.join("/repo", ".meru", "demo")
    );
  });
});

describe(toProfileName, () => {
  it("keeps a name safe as one directory", () => {
    expect(toProfileName("../.hidden/x")).toBe("hidden-x");
    expect(toProfileName("///")).toBe("default");
  });
});

const inTemp = async (body: (dir: string) => Promise<void> | void) => {
  const dir = await mkdtemp(path.join(tmpdir(), "meru-branch-"));
  try {
    await body(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
};

describe(readBranch, () => {
  it("is empty outside a repository", async () => {
    await inTemp((dir) => {
      expect(readBranch(dir)).toBe("");
    });
  });

  it("reads the branch of a checkout", async () => {
    await inTemp(async (dir) => {
      await mkdir(path.join(dir, ".git"));
      await writeFile(
        path.join(dir, ".git", "HEAD"),
        "ref: refs/heads/feature/sidebar\n"
      );
      expect(readBranch(dir)).toBe("feature/sidebar");
    });
  });

  it("follows a worktree's .git file to its own HEAD", async () => {
    await inTemp(async (dir) => {
      const gitDir = path.join(dir, "main", ".git", "worktrees", "next");
      await mkdir(gitDir, { recursive: true });
      await writeFile(path.join(gitDir, "HEAD"), "ref: refs/heads/next\n");
      const worktree = path.join(dir, "next");
      await mkdir(worktree);
      await writeFile(path.join(worktree, ".git"), `gitdir: ${gitDir}\n`);
      expect(readBranch(worktree)).toBe("next");
    });
  });

  it("follows a relative gitdir", async () => {
    await inTemp(async (dir) => {
      await mkdir(path.join(dir, "store"));
      await writeFile(path.join(dir, "store", "HEAD"), "ref: refs/heads/x\n");
      await mkdir(path.join(dir, "tree"));
      await writeFile(path.join(dir, "tree", ".git"), "gitdir: ../store\n");
      expect(readBranch(path.join(dir, "tree"))).toBe("x");
    });
  });

  it("is empty on a detached HEAD", async () => {
    await inTemp(async (dir) => {
      await mkdir(path.join(dir, ".git"));
      await writeFile(
        path.join(dir, ".git", "HEAD"),
        "0123456789abcdef0123456789abcdef01234567\n"
      );
      expect(readBranch(dir)).toBe("");
    });
  });
});

describe(userDataDirFor, () => {
  it("puts a run from the repository under its branch", () => {
    expect(
      userDataDirFor({ branch: "next", packaged: false, root: "/repo" })
    ).toBe(path.join("/repo", ".meru", "next"));
    expect(userDataDirFor({ packaged: false, root: "/repo" })).toBe(
      path.join("/repo", ".meru", "default")
    );
  });

  it("puts a locally packaged app under the checkout it was built from", () => {
    expect(
      userDataDirFor({
        markerRepo: "/src/meru",
        packaged: true,
        root: "/Applications/Meru.app",
      })
    ).toBe(path.join("/src", "meru", ".meru", "packaged"));
  });

  it("leaves an installed app on Electron's default", () => {
    expect(
      userDataDirFor({ packaged: true, root: "/Applications/Meru.app" })
    ).toBeUndefined();
  });

  it("keeps a directory named on the command line", () => {
    expect(
      userDataDirFor({
        explicitDir: "/tmp/x",
        markerRepo: "/src/meru",
        packaged: true,
        root: "/r",
      })
    ).toBe("/tmp/x");
    expect(
      userDataDirFor({ explicitDir: "/tmp/y", packaged: false, root: "/r" })
    ).toBe("/tmp/y");
  });
});
