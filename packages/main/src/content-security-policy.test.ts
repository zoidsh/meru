import { describe, expect, it } from "vitest";

import { createContentSecurityPolicy } from "./content-security-policy.ts";

const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((entry) => entry.startsWith(`${name} `))
    ?.split(" ")
    .slice(1);

describe(createContentSecurityPolicy, () => {
  it("lets a built page load only from its own origin", () => {
    const policy = createContentSecurityPolicy();

    expect(directive(policy, "default-src")).toStrictEqual(["'none'"]);
    expect(directive(policy, "script-src")).toStrictEqual(["'self'"]);
    expect(directive(policy, "style-src")).toStrictEqual(["'self'"]);
    expect(directive(policy, "connect-src")).toStrictEqual(["'self'"]);
    expect(policy).not.toMatch(/unsafe|https?:|ws:/u);
  });

  it("lets a development page load from exactly the dev server", () => {
    const policy = createContentSecurityPolicy({
      url: "http://127.0.0.1:5173/",
      nonce: "abc123",
    });

    expect(directive(policy, "script-src")).toStrictEqual([
      "http://127.0.0.1:5173",
      "'nonce-abc123'",
    ]);
    expect(directive(policy, "style-src")).toStrictEqual([
      "http://127.0.0.1:5173",
      "'nonce-abc123'",
    ]);
    expect(directive(policy, "connect-src")).toStrictEqual([
      "http://127.0.0.1:5173",
      "ws://127.0.0.1:5173",
    ]);
    expect(policy).not.toMatch(/unsafe|'self'|\*/u);
  });
});
