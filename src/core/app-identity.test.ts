import { describe, expect, it } from "vitest";

import { appIdentity } from "./app-identity.ts";

const RELEASE = { productName: "Meru", appId: "sh.zoid.meru" };
const DEV = { productName: "Meru Dev", appId: "sh.zoid.meru.dev" };

describe(appIdentity, () => {
  it("names a release build of a release or beta version Meru", () => {
    expect(appIdentity({ version: "4.0.0", isRelease: true })).toStrictEqual(
      RELEASE
    );
    expect(
      appIdentity({ version: "4.0.0-beta.1", isRelease: true })
    ).toStrictEqual(RELEASE);
  });

  it("names a -dev version Meru Dev, however it is spelled", () => {
    for (const version of ["4.0.0-dev.0", "4.0.0-dev", "4.0.0-DEV+abc"]) {
      expect(appIdentity({ version, isRelease: true })).toStrictEqual(DEV);
    }

    expect(
      appIdentity({ version: "4.0.0-devops.1", isRelease: true })
    ).toStrictEqual(RELEASE);
  });

  it("names a build that is not a release Meru Dev whatever its version", () => {
    expect(appIdentity({ version: "4.0.0", isRelease: false })).toStrictEqual(
      DEV
    );
  });
});
