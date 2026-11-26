import type { Platform } from "./platform.ts";
import { decodeSettings, readSetting } from "./settings.ts";

/**
 * Whether this launch keeps hardware acceleration, from `settings.json` as
 * read before the app is ready, or nothing when there is no file. Anything
 * the store would not read, a newer version included, reads as on: the
 * store decides what becomes of that file once the app is ready.
 */
export const hardwareAccelerationAtLaunch = (
  text: string | undefined,
  platform: Platform
) => {
  if (text === undefined) {
    return true;
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    return true;
  }

  const decoded = decodeSettings(value);

  return decoded.kind === "read"
    ? readSetting(decoded.value, "hardwareAcceleration", platform)
    : true;
};
