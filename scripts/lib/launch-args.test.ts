import { describe, expect, it } from "vitest";

import {
  defaultProfileFor,
  exitCodeFor,
  parseLaunchArgs,
} from "./launch-args.ts";

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

  it("refuses --user-data-dir, which the profile decides", () => {
    expect(() => parseLaunchArgs(["--user-data-dir=/tmp/x"])).toThrow(
      /--profile/u
    );
    expect(() => parseLaunchArgs(["--user-data-dir="])).toThrow(/--profile/u);
    expect(() => parseLaunchArgs(["--user-data-dir", "/tmp/x"])).toThrow(
      /--profile/u
    );
  });

  it("refuses --profile and --debug-port without a value", () => {
    expect(() => parseLaunchArgs(["--profile"])).toThrow(/needs a value/u);
    expect(() => parseLaunchArgs(["--profile", "--background"])).toThrow(
      /needs a value/u
    );
    expect(() => parseLaunchArgs(["--debug-port"])).toThrow(/needs a value/u);
  });

  it("refuses a profile that is not one plain directory name", () => {
    for (const profile of [
      "",
      "..",
      ".",
      "a/b",
      String.raw`a\b`,
      "../x",
      "/abs",
    ]) {
      expect(() => parseLaunchArgs([`--profile=${profile}`])).toThrow(
        /not a single directory name/u
      );
    }
  });

  it("refuses a debug port that is not a number", () => {
    expect(() => parseLaunchArgs(["--debug-port=abc"])).toThrow(
      /not a port number/u
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

describe(exitCodeFor, () => {
  it("passes on Electron's exit code", () => {
    expect(exitCodeFor(0, null, false)).toBe(0);
    expect(exitCodeFor(3, null, false)).toBe(3);
  });

  it("fails when a signal the script did not send killed Electron", () => {
    expect(exitCodeFor(null, "SIGSEGV", false)).toBe(1);
    expect(exitCodeFor(null, "SIGKILL", false)).toBe(1);
  });

  it("succeeds when the script stopped Electron itself", () => {
    expect(exitCodeFor(null, "SIGTERM", true)).toBe(0);
    expect(exitCodeFor(null, "SIGKILL", true)).toBe(0);
  });
});
