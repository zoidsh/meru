import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const platform = { isWindows: false, isMacOS: false, isLinux: false };

const relaunch = mock();

mock.module("electron", () => ({ app: { relaunch } }));

mock.module("@electron-toolkit/utils", () => ({ platform }));

const { relaunchApp } = await import("./relaunch");

const args = process.argv.slice(1);

const environment = {
  APPIMAGE: process.env.APPIMAGE,
  PORTABLE_EXECUTABLE_FILE: process.env.PORTABLE_EXECUTABLE_FILE,
};

function setEnv(name: keyof typeof environment, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("relaunchApp", () => {
  beforeEach(() => {
    relaunch.mockClear();

    platform.isWindows = false;
    platform.isMacOS = false;
    platform.isLinux = false;

    setEnv("APPIMAGE", undefined);
    setEnv("PORTABLE_EXECUTABLE_FILE", undefined);
  });

  afterEach(() => {
    setEnv("APPIMAGE", environment.APPIMAGE);
    setEnv("PORTABLE_EXECUTABLE_FILE", environment.PORTABLE_EXECUTABLE_FILE);
  });

  test("relaunches the AppImage the user launched", () => {
    platform.isLinux = true;
    process.env.APPIMAGE = "/home/someone/Apps/Meru.AppImage";

    relaunchApp();

    expect(relaunch).toHaveBeenCalledWith({
      execPath: "/home/someone/Apps/Meru.AppImage",
      args,
    });
  });

  test("relaunches the portable executable the user launched", () => {
    platform.isWindows = true;
    process.env.PORTABLE_EXECUTABLE_FILE = String.raw`C:\Users\Someone\Downloads\Meru.exe`;

    relaunchApp();

    expect(relaunch).toHaveBeenCalledWith({
      execPath: String.raw`C:\Users\Someone\Downloads\Meru.exe`,
      args,
    });
  });

  test("leaves the executable to Electron on an installed build", () => {
    platform.isLinux = true;

    relaunchApp();

    expect(relaunch).toHaveBeenCalledWith();
  });

  test("ignores each launcher's variable on the other platform", () => {
    platform.isLinux = true;
    process.env.PORTABLE_EXECUTABLE_FILE = String.raw`C:\Users\Someone\Downloads\Meru.exe`;

    relaunchApp();

    platform.isLinux = false;
    platform.isWindows = true;
    setEnv("PORTABLE_EXECUTABLE_FILE", undefined);
    process.env.APPIMAGE = "/home/someone/Apps/Meru.AppImage";

    relaunchApp();

    expect(relaunch).toHaveBeenCalledTimes(2);
    expect(relaunch).toHaveBeenNthCalledWith(1);
    expect(relaunch).toHaveBeenNthCalledWith(2);
  });

  test("leaves macOS on the executable Electron resolves", () => {
    platform.isMacOS = true;
    process.env.APPIMAGE = "/home/someone/Apps/Meru.AppImage";

    relaunchApp();

    expect(relaunch).toHaveBeenCalledWith();
  });
});
