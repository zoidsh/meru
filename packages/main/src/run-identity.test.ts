import { describe, expect, it } from "vitest";

import { decideUserData } from "./run-identity.ts";

const appData = "/Users/me/Library/Application Support";

const packagedDev = {
  isPackaged: true,
  productName: "Meru",
  version: "4.0.0-dev.0",
  appData,
  installedNames: ["Meru", "meru"],
  userDataDirSwitch: undefined,
  platform: "darwin" as const,
};

const unpackaged = { ...packagedDev, isPackaged: false };

const release = { ...packagedDev, version: "4.0.0" };

describe("decideUserData for a packaged -dev build", () => {
  it("moves to a folder of its own when given no directory", () => {
    const dev = { kind: "use", dir: `${appData}/Meru Dev`, move: true };

    expect(decideUserData(packagedDev)).toStrictEqual(dev);
    expect(
      decideUserData({ ...packagedDev, version: "4.0.0-DEV.3" })
    ).toStrictEqual(dev);
  });

  it("treats an empty or bare --user-data-dir as no directory", () => {
    for (const userDataDirSwitch of ["", "  "]) {
      expect(
        decideUserData({ ...packagedDev, userDataDirSwitch })
      ).toStrictEqual({ kind: "use", dir: `${appData}/Meru Dev`, move: true });
    }
  });

  it("uses a directory it is given", () => {
    expect(
      decideUserData({ ...packagedDev, userDataDirSwitch: "/tmp/profile" })
    ).toStrictEqual({ kind: "use", dir: "/tmp/profile", move: false });
  });

  it("refuses an installed Meru's folder however it is spelled", () => {
    for (const userDataDirSwitch of [
      `${appData}/Meru`,
      `${appData}/meru/`,
      `${appData}/x/../MERU`,
    ]) {
      expect(
        decideUserData({ ...packagedDev, userDataDirSwitch })
      ).toMatchObject({ kind: "refuse" });
    }
  });
});

describe("decideUserData for an unpackaged run", () => {
  it("uses the profile it is given", () => {
    expect(
      decideUserData({
        ...unpackaged,
        userDataDirSwitch: "/repo/.meru/default",
      })
    ).toStrictEqual({ kind: "use", dir: "/repo/.meru/default", move: false });
  });

  it("refuses to run without a directory, empty or absent", () => {
    for (const userDataDirSwitch of [undefined, ""]) {
      expect(
        decideUserData({ ...unpackaged, userDataDirSwitch })
      ).toMatchObject({ kind: "refuse" });
    }
  });

  it("refuses an installed Meru's folder and a packaged dev build's", () => {
    for (const name of ["Meru", "meru", "Meru Dev"]) {
      expect(
        decideUserData({
          ...unpackaged,
          userDataDirSwitch: `${appData}/${name}`,
        })
      ).toMatchObject({ kind: "refuse" });
    }
  });

  it("tells case apart on Linux", () => {
    const linux = {
      ...unpackaged,
      appData: "/home/me/.config",
      platform: "linux" as const,
    };

    expect(
      decideUserData({ ...linux, userDataDirSwitch: "/home/me/.config/Meru" })
    ).toMatchObject({ kind: "refuse" });
    expect(
      decideUserData({ ...linux, userDataDirSwitch: "/home/me/.config/MERU" })
    ).toMatchObject({ kind: "use" });
  });
});

describe("decideUserData for a release", () => {
  it("keeps Electron's default, the installed folder", () => {
    expect(decideUserData(release)).toStrictEqual({
      kind: "use",
      dir: `${appData}/Meru`,
      move: false,
    });
  });

  it("uses whatever directory it is given", () => {
    expect(
      decideUserData({ ...release, userDataDirSwitch: `${appData}/Meru` })
    ).toStrictEqual({ kind: "use", dir: `${appData}/Meru`, move: false });
  });
});
