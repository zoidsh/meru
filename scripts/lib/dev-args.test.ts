import { describe, expect, it } from "vitest";

import { resolveProfile, splitArgs, toProfileName } from "./dev-args.ts";

describe(splitArgs, () => {
  it("claims --profile and --background and passes the rest to Electron", () => {
    expect(
      splitArgs(
        ["--profile", "work", "--inspect", "--background", "--disable-gpu"],
        {}
      )
    ).toStrictEqual({
      background: true,
      electronArgs: ["--inspect", "--disable-gpu"],
      profile: "work",
    });
    expect(splitArgs(["--profile=home"], {}).profile).toBe("home");
  });

  it("runs in the background when the environment asks", () => {
    expect(splitArgs([], { MERU_BACKGROUND: "1" }).background).toBeTruthy();
    expect(splitArgs([], {}).background).toBeFalsy();
  });

  it("refuses --profile without a name", () => {
    expect(() => splitArgs(["--profile"], {})).toThrow(
      "--profile needs a name"
    );
  });
});

describe(resolveProfile, () => {
  const linked = {
    branch: "feature/sidebar",
    gitCommonDir: "/repo/.git",
    gitDir: "/repo/.git/worktrees/sidebar",
    toplevel: "/repo/.claude/worktrees/sidebar",
  };

  it("names a linked worktree's profile after its branch", () => {
    expect(resolveProfile(undefined, linked)).toBe("feature-sidebar");
  });

  it("falls back to the folder on a detached HEAD", () => {
    expect(resolveProfile(undefined, { ...linked, branch: "" })).toBe(
      "sidebar"
    );
  });

  it("leaves the main checkout on the default directory", () => {
    expect(
      resolveProfile(undefined, {
        ...linked,
        gitDir: "/repo/.git",
        toplevel: "/repo",
      })
    ).toBeUndefined();
  });

  it("prefers a named profile", () => {
    expect(resolveProfile("demo", linked)).toBe("demo");
  });
});

describe(toProfileName, () => {
  it("keeps a name safe as one directory", () => {
    expect(toProfileName("../.hidden/x")).toBe("hidden-x");
    expect(toProfileName("///")).toBe("worktree");
  });
});
