import { hardwareAccelerationAtLaunch } from "#core/hardware-acceleration.ts";
import type { Platform } from "#core/platform.ts";
import type { AppLifecycle } from "#platform/app.ts";
import type { TextFile } from "#platform/text-file.ts";

/**
 * Turns hardware acceleration off for the run when `settings.json` says so,
 * read at once since Electron takes it only before the app is ready, so
 * before the stores load. It only reads: whatever becomes of a file it cannot
 * use is the stores' to decide once the app is ready. Answers whether the run
 * keeps it.
 */
export const wireHardwareAcceleration = ({
  settingsFile,
  lifecycle,
  platform,
}: {
  settingsFile: Pick<TextFile, "readSync">;
  lifecycle: Pick<AppLifecycle, "disableHardwareAcceleration">;
  platform: Platform;
}) => {
  let text: string | undefined;

  try {
    text = settingsFile.readSync();
  } catch {
    text = undefined;
  }

  const on = hardwareAccelerationAtLaunch(text, platform);

  if (!on) {
    lifecycle.disableHardwareAcceleration();
  }

  return on;
};
