import { describe, expect, test } from "bun:test";
import { resolveMigrationVersion } from "./migration-version";

describe("resolveMigrationVersion", () => {
  test("leaves a stable version alone", () => {
    expect(resolveMigrationVersion("3.60.0")).toBe("3.60.0");
  });

  test("drops a prerelease suffix so a Beta build still matches the migration keys", () => {
    // `semver.satisfies("3.60.0-beta.1", ">=3.60.0")` is false, and conf passes
    // no `includePrerelease`, so the raw version misses every key in the ladder.
    expect(resolveMigrationVersion("3.60.0-beta.1")).toBe("3.60.0");
    expect(resolveMigrationVersion("3.61.0-alpha.12")).toBe("3.61.0");
  });

  test("passes an unrecognized version through rather than emptying it", () => {
    expect(resolveMigrationVersion("dev")).toBe("dev");
  });
});
