import { describe, expect, it } from "vitest";

import { HOOK_MARKER, hookAction, hookScript } from "./hooks.ts";

describe(hookAction, () => {
  it("installs the hook on a fresh clone", () => {
    expect(hookAction({ ci: false, existing: undefined })).toBe("write");
  });

  it("does nothing in CI", () => {
    expect(hookAction({ ci: true, existing: undefined })).toBe("skip: CI");
  });

  it("refreshes a hook it wrote itself", () => {
    expect(hookAction({ ci: false, existing: hookScript("pre-commit") })).toBe(
      "write"
    );
  });

  it("leaves another worktree's lefthook hook and another tool's hook alone", () => {
    expect(
      hookAction({ ci: false, existing: "#!/bin/sh\ncall_lefthook run" })
    ).toBe("skip: lefthook hook already installed");
    expect(hookAction({ ci: false, existing: "#!/bin/sh\nhusky" })).toBe(
      "skip: a hook of another tool is installed"
    );
  });
});

describe(hookScript, () => {
  it("names no absolute path, so every worktree can share it", () => {
    const script = hookScript("pre-commit");

    expect(script).toContain(HOOK_MARKER);
    expect(script).toContain('exec "$bin" run pre-commit "$@"');
    expect(script).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/u);
  });
});
