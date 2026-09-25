import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  DEFAULT_RENDERER_PORT,
  defaultUserDataDir,
  parseDevToolsActivePort,
  resolveRendererPort,
  resolveWorktreeProfile,
  toProfileName,
} from "./dev-run";

describe("resolveRendererPort", () => {
  test("takes the port an outer tool assigned", () => {
    expect(resolveRendererPort("4173")).toBe(4173);
  });

  test("falls back to the repository's own port", () => {
    expect(resolveRendererPort(undefined)).toBe(DEFAULT_RENDERER_PORT);
    expect(resolveRendererPort("")).toBe(DEFAULT_RENDERER_PORT);
  });

  test("passes on a zero port, which asks for a free one", () => {
    expect(resolveRendererPort("0")).toBe(0);
  });

  test("refuses a port nothing could serve on", () => {
    expect(() => resolveRendererPort("-1")).toThrow("PORT is -1");
    expect(() => resolveRendererPort("70000")).toThrow("PORT is 70000");
    expect(() => resolveRendererPort("3000.5")).toThrow("PORT is 3000.5");
    expect(() => resolveRendererPort("three thousand")).toThrow("PORT is three thousand");
  });
});

describe("toProfileName", () => {
  test("keeps a name that is already a folder name", () => {
    expect(toProfileName("download-notification-button")).toBe("download-notification-button");
  });

  test("replaces everything a path separator could be read out of", () => {
    expect(toProfileName("feature/unified-inbox")).toBe("feature-unified-inbox");
    expect(toProfileName("tim/fix#1107")).toBe("tim-fix-1107");
    expect(toProfileName(String.raw`windows\branch`)).toBe("windows-branch");
  });

  test("never hides the profile behind a leading dot", () => {
    expect(toProfileName(".hidden")).toBe("hidden");
    expect(toProfileName("../../escape")).toBe("escape");
  });

  test("keeps the name short enough to be a folder name everywhere", () => {
    expect(toProfileName(`${"a".repeat(80)}/b`)).toBe("a".repeat(64));
  });

  test("names a profile that sanitizes away after the worktree instead", () => {
    expect(toProfileName("///")).toBe("worktree");
    expect(toProfileName("")).toBe("worktree");
  });
});

const mainCheckout = {
  gitDir: ".git",
  gitCommonDir: ".git",
  toplevel: "/home/someone/projects/meru",
  branch: "main",
};

const linkedWorktree = {
  gitDir: "/home/someone/projects/meru/.git/worktrees/meru-unified-inbox",
  gitCommonDir: "/home/someone/projects/meru/.git",
  toplevel: "/home/someone/projects/meru-unified-inbox",
  branch: "feature/unified-inbox",
};

describe("resolveWorktreeProfile", () => {
  test("leaves the main checkout on the default user data directory", () => {
    expect(resolveWorktreeProfile(mainCheckout)).toBeUndefined();
  });

  test("names a linked worktree's profile after its branch", () => {
    expect(resolveWorktreeProfile(linkedWorktree)).toBe("feature-unified-inbox");
  });

  test("names a detached worktree after its folder", () => {
    expect(resolveWorktreeProfile({ ...linkedWorktree, branch: undefined })).toBe(
      "meru-unified-inbox",
    );
  });

  test("reads the two directories as paths rather than as strings", () => {
    expect(
      resolveWorktreeProfile({
        ...mainCheckout,
        gitDir: "/home/someone/projects/meru/.git",
        gitCommonDir: "/home/someone/projects/meru/.git/",
      }),
    ).toBeUndefined();
  });
});

describe("parseDevToolsActivePort", () => {
  test("reads the port off the first line", () => {
    expect(parseDevToolsActivePort("41235\n/devtools/browser/8f2c\n")).toBe(41235);
  });

  test("waits out a file that is still being written", () => {
    expect(parseDevToolsActivePort("")).toBeUndefined();
    expect(parseDevToolsActivePort("\n")).toBeUndefined();
    expect(parseDevToolsActivePort("0\n")).toBeUndefined();
    expect(parseDevToolsActivePort("41")).toBe(41);
  });
});

describe("defaultUserDataDir", () => {
  const homeDir = "/home/someone";

  test("follows Electron's default on each platform", () => {
    expect(defaultUserDataDir({ platform: "linux", env: {}, homeDir }, "Meru")).toBe(
      path.join(homeDir, ".config", "Meru"),
    );
    expect(defaultUserDataDir({ platform: "darwin", env: {}, homeDir }, "Meru")).toBe(
      path.join(homeDir, "Library", "Application Support", "Meru"),
    );
    expect(defaultUserDataDir({ platform: "win32", env: {}, homeDir }, "Meru")).toBe(
      path.join(homeDir, "AppData", "Roaming", "Meru"),
    );
  });

  test("takes the directory each platform names it in the environment", () => {
    expect(
      defaultUserDataDir(
        { platform: "linux", env: { XDG_CONFIG_HOME: "/config" }, homeDir },
        "Meru",
      ),
    ).toBe(path.join("/config", "Meru"));
    expect(
      defaultUserDataDir({ platform: "win32", env: { APPDATA: "/roaming" }, homeDir }, "Meru"),
    ).toBe(path.join("/roaming", "Meru"));
  });
});
