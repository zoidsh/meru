import type { SystemInfo } from "./system-info.ts";

/**
 * A system that answers what it is given, and counts how often its
 * `os-release` was read.
 */
export const fakeSystemInfo = ({
  appVersion = "4.0.0",
  systemVersion = "27.2",
  arch = "arm64",
  osRelease,
}: {
  appVersion?: string;
  systemVersion?: string;
  arch?: string;
  osRelease?: string;
} = {}) => {
  let reads = 0;
  const system: SystemInfo = {
    appVersion: () => appVersion,
    systemVersion: () => systemVersion,
    arch,
    osRelease: () => {
      reads += 1;

      return osRelease;
    },
  };

  return { system, osReleaseReads: () => reads };
};
