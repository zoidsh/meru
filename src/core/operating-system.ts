import type { Platform } from "./platform.ts";

/** Windows 11 kept Windows 10's version number, 10.0; only its build tells them apart. */
const FIRST_WINDOWS_11_BUILD = 22_000;

/**
 * The `PRETTY_NAME` of an `os-release` file's text, its quotes removed;
 * nothing when there is no text, no such key or an empty value.
 */
export const prettyNameOf = (osRelease: string | undefined) => {
  const value = /^PRETTY_NAME=(?<value>.*)$/mu
    .exec(osRelease ?? "")
    ?.groups?.value?.trim();
  const unquoted =
    /^(?<quote>["'])(?<inner>.*)\k<quote>$/u.exec(value ?? "")?.groups?.inner ??
    value;

  return unquoted?.trim() || undefined;
};

const windowsName = (systemVersion: string) => {
  const build = Number(systemVersion.split(".")[2]);

  if (!Number.isInteger(build)) {
    return "Windows";
  }

  return `${build >= FIRST_WINDOWS_11_BUILD ? "Windows 11" : "Windows 10"} ${build}`;
};

/**
 * The operating system as the About page shows it: its name and version,
 * then the processor architecture, as `macOS 27.2 (arm64)`.
 */
export const operatingSystemLabel = ({
  platform,
  systemVersion,
  osRelease,
  arch,
}: {
  platform: Platform;
  /** As Electron's `process.getSystemVersion()` gives it, `10.0.26100` on Windows. */
  systemVersion: string;
  /** The text of `/etc/os-release`, read on Linux alone. */
  osRelease: string | undefined;
  arch: string;
}) => {
  let name: string;

  switch (platform) {
    case "darwin": {
      name = `macOS ${systemVersion}`;
      break;
    }
    case "win32": {
      name = windowsName(systemVersion);
      break;
    }
    case "linux": {
      name = prettyNameOf(osRelease) ?? "Linux";
      break;
    }
    default: {
      name = platform satisfies never;
    }
  }

  return `${name} (${arch})`;
};
