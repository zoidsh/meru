import { readFileSync } from "node:fs";

import { app } from "electron";
import { attempt } from "es-toolkit";

/** What the About page says of this build and the system it runs on. */
export interface SystemInfo {
  /** As `app.getVersion()` gives it. */
  appVersion: () => string;
  /** As Electron's `process.getSystemVersion()` gives it. */
  systemVersion: () => string;
  arch: string;
  /** The text of `/etc/os-release`; nothing when it cannot be read. */
  osRelease: () => string | undefined;
}

export const createSystemInfo = (): SystemInfo => ({
  appVersion: () => app.getVersion(),
  systemVersion: () => process.getSystemVersion(),
  arch: process.arch,
  osRelease: () =>
    attempt(() => readFileSync("/etc/os-release", "utf-8"))[1] ?? undefined,
});
