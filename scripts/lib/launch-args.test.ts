import { describe, expect, it } from "vitest";

import { defaultProfileFor, parseLaunchArgs } from "./launch-args.ts";

describe(parseLaunchArgs, () => {
  it("reads its own flags and passes the rest to Electron as typed", () => {
    expect(
      parseLaunchArgs([
        "--profile",
        "signin",
        "--debug-port=0",
        "--background",
        "--disable-gpu",
        "--lang=de",
      ])
    ).toStrictEqual({
      profile: "signin",
      debugPort: "0",
      background: true,
      electronArgs: ["--disable-gpu", "--lang=de"],
    });
  });

  it("leaves the profile to the caller when none is given", () => {
    expect(parseLaunchArgs([])).toStrictEqual({
      profile: undefined,
      debugPort: undefined,
      background: false,
      electronArgs: [],
    });
  });

  it("refuses a profile that is not one directory name, or none", () => {
    for (const profile of ["", "..", ".", "a/b", String.raw`a\b`, "/abs"]) {
      expect(() => parseLaunchArgs([`--profile=${profile}`])).toThrow(
        /single directory name/u
      );
    }

    expect(() => parseLaunchArgs(["--profile"])).toThrow(
      /single directory name/u
    );
  });
});

describe(defaultProfileFor, () => {
  it("gives the main checkout the default profile", () => {
    expect(
      defaultProfileFor({
        gitDir: "/repo/.git",
        commonDir: "/repo/.git",
        branch: "main",
        toplevel: "/repo",
      })
    ).toBe("default");
    expect(defaultProfileFor(undefined)).toBe("default");
  });

  it("names a linked worktree's profile after its branch, made safe", () => {
    expect(
      defaultProfileFor({
        gitDir: "/repo/.git/worktrees/v4",
        commonDir: "/repo/.git",
        branch: "feature/tabs",
        toplevel: "/repo/.claude/worktrees/v4",
      })
    ).toBe("feature-tabs");
  });

  it("names a detached worktree's profile after its folder", () => {
    expect(
      defaultProfileFor({
        gitDir: "/repo/.git/worktrees/rebase",
        commonDir: "/repo/.git",
        branch: undefined,
        toplevel: "/repo/.claude/worktrees/rebase",
      })
    ).toBe("rebase");
  });
});
