import { describe, expect, it } from "vitest";

import { relaunchOptions, startedExecutable } from "./executable.ts";

const EXEC = "/tmp/.mount_MeruXy/meru";
const ARGV = [EXEC, "--user-data-dir=/home/a/meru", "--background"];

describe(startedExecutable, () => {
  it("is the running executable for an installed build", () => {
    expect(startedExecutable({}, "/opt/Meru/meru")).toBe("/opt/Meru/meru");
  });

  it("is the AppImage, not its unpacked copy", () => {
    expect(startedExecutable({ APPIMAGE: "/home/a/Meru.AppImage" }, EXEC)).toBe(
      "/home/a/Meru.AppImage"
    );
  });

  it("is Windows' portable .exe, not its unpacked copy", () => {
    expect(
      startedExecutable(
        { PORTABLE_EXECUTABLE_FILE: String.raw`C:\Users\a\Meru.exe` },
        String.raw`C:\Users\a\AppData\Local\Temp\2abc\Meru.exe`
      )
    ).toBe(String.raw`C:\Users\a\Meru.exe`);
  });

  it("ignores an empty variable", () => {
    expect(startedExecutable({ APPIMAGE: "" }, EXEC)).toBe(EXEC);
  });
});

describe(relaunchOptions, () => {
  it("starts the AppImage again with this run's arguments", () => {
    expect(
      relaunchOptions({
        env: { APPIMAGE: "/home/a/Meru.AppImage" },
        execPath: EXEC,
        argv: ARGV,
      })
    ).toStrictEqual({
      execPath: "/home/a/Meru.AppImage",
      args: ["--user-data-dir=/home/a/meru", "--background"],
    });
  });

  it("keeps the arguments of an installed build too", () => {
    expect(
      relaunchOptions({ env: {}, execPath: "/opt/Meru/meru", argv: ARGV })
    ).toStrictEqual({
      execPath: "/opt/Meru/meru",
      args: ["--user-data-dir=/home/a/meru", "--background"],
    });
  });
});
