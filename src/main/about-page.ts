import { once } from "es-toolkit";

import type { AboutItem, SettingsState } from "#contract/settings.ts";
import { operatingSystemLabel } from "#core/operating-system.ts";
import type { Platform } from "#core/platform.ts";
import type { Clipboard } from "#platform/clipboard.ts";
import type { SystemInfo } from "#platform/system-info.ts";

/**
 * The About page's version and operating system, read the first time the
 * page's state is, since neither changes while Meru runs, and Copy, which
 * puts main's own string on the clipboard.
 */
export const createAboutPage = ({
  platform,
  system,
  clipboard,
}: {
  platform: Platform;
  system: SystemInfo;
  clipboard: Clipboard;
}) => {
  const read = once((): SettingsState["about"] => ({
    version: system.appVersion(),
    operatingSystem: operatingSystemLabel({
      platform,
      systemVersion: system.systemVersion(),
      osRelease: platform === "linux" ? system.osRelease() : undefined,
      arch: system.arch,
    }),
  }));

  return {
    read,
    copy: (item: AboutItem) => clipboard.writeText(read()[item]),
  };
};

export type AboutPage = ReturnType<typeof createAboutPage>;
