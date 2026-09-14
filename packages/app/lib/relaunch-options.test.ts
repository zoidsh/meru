import { describe, expect, test } from "bun:test";
import { getRelaunchOptions } from "./relaunch-options";

const linux = { isLinux: true, isWindows: false };
const windows = { isLinux: false, isWindows: true };
const macOS = { isLinux: false, isWindows: false };

const argv = ["/tmp/.mount_Meru/meru", "--profile", "work"];

describe("getRelaunchOptions", () => {
  test("relaunches the AppImage the user launched", () => {
    expect(
      getRelaunchOptions(linux, { APPIMAGE: "/home/someone/Apps/Meru.AppImage" }, argv),
    ).toEqual({
      execPath: "/home/someone/Apps/Meru.AppImage",
      args: ["--profile", "work"],
    });
  });

  test("relaunches the portable executable the user launched", () => {
    const file = String.raw`C:\Users\Someone\Downloads\Meru.exe`;

    expect(getRelaunchOptions(windows, { PORTABLE_EXECUTABLE_FILE: file }, argv)).toEqual({
      execPath: file,
      args: ["--profile", "work"],
    });
  });

  test("leaves the executable to Electron on an installed build", () => {
    expect(getRelaunchOptions(linux, {}, argv)).toBeUndefined();
    expect(getRelaunchOptions(windows, {}, argv)).toBeUndefined();
    expect(getRelaunchOptions(macOS, {}, argv)).toBeUndefined();
  });

  test("ignores each launcher's variable on the other platforms", () => {
    const env = {
      APPIMAGE: "/home/someone/Apps/Meru.AppImage",
      PORTABLE_EXECUTABLE_FILE: String.raw`C:\Users\Someone\Downloads\Meru.exe`,
    };

    expect(getRelaunchOptions(linux, env, argv)?.execPath).toBe(env.APPIMAGE);
    expect(getRelaunchOptions(windows, env, argv)?.execPath).toBe(env.PORTABLE_EXECUTABLE_FILE);
    expect(getRelaunchOptions(macOS, env, argv)).toBeUndefined();
  });
});
