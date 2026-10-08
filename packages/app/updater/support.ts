export const MINIMUM_MACOS_VERSION = "13.0.0";

/**
 * electron-updater's own check is unused here rather than wrong. Its feed
 * field, `UpdateInfo.minimumSystemVersion`, is documented as a kernel version
 * and compared against `os.release()` to match, but electron-builder writes
 * `minimumSystemVersion` only into `Info.plist` and the pkg requirement, never
 * into `latest-mac.yml`, so it arrives undefined and the check never fires.
 * Reading `process.getSystemVersion()` lets the constant above be the product
 * version rather than the Darwin number that would have to stand in for it.
 *
 * `semver` is not imported: electron-updater's nested copy is not shared with a
 * declared one, and declaring it adds some 50 KB to `app.js`.
 */
export function isUpdateSupported(platform: NodeJS.Platform, systemVersion: string) {
  if (platform !== "darwin") {
    return true;
  }

  if (!/^\d+(?:\.\d+)*$/.test(systemVersion)) {
    return true;
  }

  return !isBelow(systemVersion.split("."), MINIMUM_MACOS_VERSION.split("."));
}

function isBelow(version: string[], minimum: string[]) {
  for (let index = 0; index < minimum.length; index += 1) {
    const difference = Number(version[index] ?? 0) - Number(minimum[index] ?? 0);

    if (difference !== 0) {
      return difference < 0;
    }
  }

  return false;
}
