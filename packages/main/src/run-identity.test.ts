import { describe, expect, it } from "vitest";

import {
  appUserModelIdFor,
  packagedUserDataDir,
  refuseUserDataDir,
  userDataNameFor,
} from "./run-identity.ts";

const mac = {
  isPackaged: false,
  appData: "/Users/me/Library/Application Support",
  appNames: ["Meru", "meru"],
  platform: "darwin" as const,
};

describe(refuseUserDataDir, () => {
  it("lets an unpackaged run use a profile of its own", () => {
    expect(
      refuseUserDataDir({ ...mac, userData: "/repo/.meru/default" })
    ).toBeUndefined();
  });

  it("refuses the installed app's directory, which an empty --user-data-dir falls back to", () => {
    expect(
      refuseUserDataDir({
        ...mac,
        userData: "/Users/me/Library/Application Support/Meru",
      })
    ).toMatch(/installed Meru/u);
  });

  it("refuses it however it is spelled", () => {
    expect(
      refuseUserDataDir({
        ...mac,
        userData: "/Users/me/Library/Application Support/meru/",
      })
    ).toMatch(/installed Meru/u);
    expect(
      refuseUserDataDir({
        ...mac,
        userData: "/Users/me/Library/Application Support/x/../MERU",
      })
    ).toMatch(/installed Meru/u);
  });

  it("refuses an empty directory", () => {
    expect(refuseUserDataDir({ ...mac, userData: "" })).toMatch(
      /no user data/u
    );
  });

  it("tells case apart on Linux", () => {
    const linux = {
      ...mac,
      appData: "/home/me/.config",
      platform: "linux" as const,
    };

    expect(
      refuseUserDataDir({ ...linux, userData: "/home/me/.config/Meru" })
    ).toMatch(/installed Meru/u);
    expect(
      refuseUserDataDir({ ...linux, userData: "/home/me/.config/MERU" })
    ).toBeUndefined();
  });

  it("leaves a packaged app alone", () => {
    expect(
      refuseUserDataDir({
        ...mac,
        isPackaged: true,
        userData: "/Users/me/Library/Application Support/Meru",
      })
    ).toBeUndefined();
  });
});

describe(appUserModelIdFor, () => {
  it("gives an unpackaged run an id apart from the installed app's", () => {
    expect(appUserModelIdFor("sh.zoid.meru", true)).toBe("sh.zoid.meru");
    expect(appUserModelIdFor("sh.zoid.meru", false)).toBe("sh.zoid.meru.dev");
  });
});

describe(userDataNameFor, () => {
  it("gives a -dev build a folder apart from the installed app's", () => {
    expect(userDataNameFor("Meru", "4.0.0-dev.0")).toBe("Meru Dev");
    expect(userDataNameFor("Meru", "4.0.0-dev")).toBe("Meru Dev");
    expect(userDataNameFor("Meru", "4.0.0-dev+abc123")).toBe("Meru Dev");
  });

  it("keeps the product name for a release, a beta and a lookalike prerelease", () => {
    expect(userDataNameFor("Meru", "4.0.0")).toBe("Meru");
    expect(userDataNameFor("Meru", "4.0.0-beta.1")).toBe("Meru");
    expect(userDataNameFor("Meru", "4.0.0-devops.1")).toBe("Meru");
  });
});

describe(packagedUserDataDir, () => {
  const devBuild = {
    isPackaged: true,
    productName: "Meru",
    version: "4.0.0-dev.0",
    appData: "/Users/me/Library/Application Support",
    hasUserDataDirSwitch: false,
  };

  it("moves a packaged -dev build to its own folder", () => {
    expect(packagedUserDataDir(devBuild)).toBe(
      "/Users/me/Library/Application Support/Meru Dev"
    );
  });

  it("leaves a release on Electron's default", () => {
    expect(
      packagedUserDataDir({ ...devBuild, version: "4.0.0" })
    ).toBeUndefined();
  });

  it("leaves a directory passed with --user-data-dir alone", () => {
    expect(
      packagedUserDataDir({ ...devBuild, hasUserDataDirSwitch: true })
    ).toBeUndefined();
  });

  it("leaves an unpackaged run to its own guard", () => {
    expect(
      packagedUserDataDir({ ...devBuild, isPackaged: false })
    ).toBeUndefined();
  });
});
