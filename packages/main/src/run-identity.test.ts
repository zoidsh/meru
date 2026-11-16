import { describe, expect, it } from "vitest";

import { appUserModelIdFor, refuseUserDataDir } from "./run-identity.ts";

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
