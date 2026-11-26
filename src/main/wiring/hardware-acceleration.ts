import path from "node:path";

import { hardwareAccelerationAtLaunch } from "#core/hardware-acceleration.ts";
import type { Platform } from "#core/platform.ts";
import type { AppLifecycle } from "#platform/app.ts";
import { createTextFile } from "#platform/text-file.ts";

import { SETTINGS_FILE_NAME } from "../settings.ts";

/**
 * Turns hardware acceleration off for the run when `settings.json` says so,
 * read at once since Electron takes it only before the app is ready, so
 * before the stores load. It only reads: whatever becomes of a file it cannot
 * use is the stores' to decide once the app is ready. Answers whether the run
 * keeps it.
 */
export const wireHardwareAcceleration = (
  lifecycle: Pick<AppLifecycle, "userDataPath" | "disableHardwareAcceleration">,
  platform: Platform
) => {
  let text: string | undefined;

  try {
    text = createTextFile(
      path.join(lifecycle.userDataPath, SETTINGS_FILE_NAME)
    ).readSync();
  } catch {
    text = undefined;
  }

  const on = hardwareAccelerationAtLaunch(text, platform);

  if (!on) {
    lifecycle.disableHardwareAcceleration();
  }

  return on;
};
