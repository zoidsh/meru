import { describe, expect, it } from "vitest";

import { operatingSystemLabel, prettyNameOf } from "./operating-system.ts";

const UBUNTU = `PRETTY_NAME="Ubuntu 24.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
ID=ubuntu
`;

const windows = (systemVersion: string) =>
  operatingSystemLabel({
    platform: "win32",
    systemVersion,
    osRelease: undefined,
    arch: "x64",
  });

const linux = (osRelease: string | undefined) =>
  operatingSystemLabel({
    platform: "linux",
    systemVersion: "6.8.0-45-generic",
    osRelease,
    arch: "x64",
  });

describe("the operating system as the About page shows it", () => {
  it("names macOS by its version", () => {
    expect(
      operatingSystemLabel({
        platform: "darwin",
        systemVersion: "27.2",
        osRelease: undefined,
        arch: "arm64",
      })
    ).toBe("macOS 27.2 (arm64)");
  });

  it("names Windows 11 from build 22000 and Windows 10 before it, with the build", () => {
    expect([
      windows("10.0.26100"),
      windows("10.0.22000"),
      windows("10.0.21999"),
      windows("10.0.19045"),
      windows("10.0"),
    ]).toStrictEqual([
      "Windows 11 26100 (x64)",
      "Windows 11 22000 (x64)",
      "Windows 10 21999 (x64)",
      "Windows 10 19045 (x64)",
      "Windows (x64)",
    ]);
  });

  it("names Linux by os-release's PRETTY_NAME, else Linux", () => {
    expect([
      linux(UBUNTU),
      linux(
        "NAME=Fedora\nPRETTY_NAME='Fedora Linux 41 (Workstation Edition)'\n"
      ),
      linux("PRETTY_NAME=Arch\n"),
      linux(undefined),
      linux('NAME="Ubuntu"\n'),
      linux('PRETTY_NAME=""\n'),
      linux(""),
    ]).toStrictEqual([
      "Ubuntu 24.04.3 LTS (x64)",
      "Fedora Linux 41 (Workstation Edition) (x64)",
      "Arch (x64)",
      "Linux (x64)",
      "Linux (x64)",
      "Linux (x64)",
      "Linux (x64)",
    ]);
  });

  it("reads PRETTY_NAME only as a key of its own line", () => {
    expect([
      prettyNameOf('X_PRETTY_NAME="No"\n'),
      prettyNameOf('# PRETTY_NAME="No"\nPRETTY_NAME="Yes"'),
      prettyNameOf('PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\r\n'),
    ]).toStrictEqual([undefined, "Yes", "Debian GNU/Linux 12 (bookworm)"]);
  });
});
