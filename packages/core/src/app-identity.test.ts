import { describe, expect, it } from "vitest";

import { appIdFor, isDevVersion } from "./app-identity.ts";

describe(isDevVersion, () => {
  it("matches a -dev prerelease however it is cased", () => {
    expect(isDevVersion("4.0.0-dev.0")).toBeTruthy();
    expect(isDevVersion("4.0.0-dev")).toBeTruthy();
    expect(isDevVersion("4.0.0-dev+abc123")).toBeTruthy();
    expect(isDevVersion("4.0.0-DEV.1")).toBeTruthy();
    expect(isDevVersion("4.0.0-Dev")).toBeTruthy();
  });

  it("does not match a release, a beta or a lookalike", () => {
    expect(isDevVersion("4.0.0")).toBeFalsy();
    expect(isDevVersion("4.0.0-beta.1")).toBeFalsy();
    expect(isDevVersion("4.0.0-devops.1")).toBeFalsy();
  });
});

describe(appIdFor, () => {
  it("keeps the id for a release build of a release version", () => {
    expect(
      appIdFor("sh.zoid.meru", { version: "4.0.0", isRelease: true })
    ).toBe("sh.zoid.meru");
  });

  it("gives a -dev version, packaged or not, an id of its own", () => {
    expect(
      appIdFor("sh.zoid.meru", { version: "4.0.0-dev.0", isRelease: true })
    ).toBe("sh.zoid.meru.dev");
  });

  it("gives a build that is not a release an id of its own whatever its version", () => {
    expect(
      appIdFor("sh.zoid.meru", { version: "4.0.0", isRelease: false })
    ).toBe("sh.zoid.meru.dev");
  });
});
