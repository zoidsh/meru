import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  currentBranch,
  devUserDataDir,
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

describe(currentBranch, () => {
  it("is empty outside a repository", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "meru-branch-"));
    try {
      expect(currentBranch(outside)).toBe("");
    } finally {
      await rm(outside, { force: true, recursive: true });
    }
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
